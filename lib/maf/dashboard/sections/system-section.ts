// ABOUTME: System section generator for MAF dashboard
// ABOUTME: Creates markdown section showing system health, performance, and resource utilization

import type { SystemData } from '../collectors/sqlite-collector';
import type { FileSystemArtifact } from '../collectors/filesystem-collector';

export interface SystemSectionData {
  systemData: SystemData;
  fileSystemStats: {
    totalFiles: number;
    totalSize: number;
    filesByType: Record<string, number>;
    largestFiles: Array<{ path: string; size: number; type: string }>;
  };
  configFiles: Array<{
    path: string;
    name: string;
    exists: boolean;
    lastModified: number;
  }>;
  lastUpdated: number;
}

/**
 * Generate system section for dashboard
 */
export function generateSystemSection(data: SystemSectionData): string {
  const { systemData, fileSystemStats, configFiles, lastUpdated } = data;

  const lines = [
    '## 🖥️ System Overview',
    '',
    '*Last updated: ' + new Date(lastUpdated).toISOString() + '*',
    ''
  ];

  // System health status
  const healthEmoji = getHealthEmoji(systemData.systemHealth);
  lines.push('### System Health: ' + healthEmoji + ' ' + systemData.systemHealth.toUpperCase());
  lines.push('');

  if (systemData.systemHealth === 'critical') {
    lines.push('🚨 **CRITICAL ISSUES DETECTED** - Immediate attention required');
    lines.push('');
  } else if (systemData.systemHealth === 'warning') {
    lines.push('⚠️ **WARNING** - System performance degraded');
    lines.push('');
  } else {
    lines.push('✅ **System operating normally**');
    lines.push('');
  }

  // Core metrics
  lines.push('### Core Metrics');
  lines.push('');
  lines.push('| Metric | Value | Status |');
  lines.push('|--------|-------|--------|');
  lines.push('| **Total Tasks** | ' + systemData.totalTasks + ' | ' + getMetricEmoji(systemData.totalTasks, 'tasks') + ' |');
  lines.push('| **Active Tasks** | ' + systemData.activeTasks + ' | ' + getMetricEmoji(systemData.activeTasks, 'active') + ' |');
  lines.push('| **Completed Tasks** | ' + systemData.completedTasks + ' | ' + getMetricEmoji(systemData.completedTasks, 'completed') + ' |');
  lines.push('| **Failed Tasks** | ' + systemData.failedTasks + ' | ' + getMetricEmoji(systemData.failedTasks, 'failed') + ' |');
  lines.push('| **Active Leases** | ' + systemData.activeLeases + ' | ' + getMetricEmoji(systemData.activeLeases, 'leases') + ' |');
  lines.push('| **Total Events** | ' + systemData.totalEvents + ' | ' + getMetricEmoji(systemData.totalEvents, 'events') + ' |');
  lines.push('| **Total Evidence** | ' + systemData.totalEvidence + ' | ' + getMetricEmoji(systemData.totalEvidence, 'evidence') + ' |');
  lines.push('');

  // Task performance metrics
  if (systemData.totalTasks > 0) {
    const completionRate = ((systemData.completedTasks / systemData.totalTasks) * 100).toFixed(1);
    const failureRate = ((systemData.failedTasks / systemData.totalTasks) * 100).toFixed(1);
    
    lines.push('### Performance Metrics');
    lines.push('');
    lines.push('- **Task Completion Rate:** ' + completionRate + '%');
    lines.push('- **Task Failure Rate:** ' + failureRate + '%');
    lines.push('- **Active Task Ratio:** ' + ((systemData.activeTasks / systemData.totalTasks) * 100).toFixed(1) + '%');
    
    if (systemData.oldestActiveTask) {
      const oldestAge = Math.floor((Date.now() - systemData.oldestActiveTask) / 1000 / 60); // minutes
      lines.push('- **Oldest Active Task:** ' + oldestAge + ' minutes old');
    }
    
    if (systemData.newestTask) {
      const newestAge = Math.floor((Date.now() - systemData.newestTask) / 1000 / 60); // minutes
      lines.push('- **Newest Task:** ' + newestAge + ' minutes old');
    }
    
    lines.push('');
  }

  // File system status
  lines.push('### File System Status');
  lines.push('');
  lines.push('- **Total Files:** ' + fileSystemStats.totalFiles);
  lines.push('- **Total Disk Usage:** ' + formatBytes(fileSystemStats.totalSize));
  lines.push('');
  
  if (Object.keys(fileSystemStats.filesByType).length > 0) {
    lines.push('#### Files by Type');
    lines.push('');
    
    for (const [type, count] of Object.entries(fileSystemStats.filesByType)) {
      const emoji = getFileTypeEmoji(type);
      lines.push('- ' + emoji + ' ' + type + ': ' + count + ' files');
    }
    lines.push('');
  }

  // Largest files
  if (fileSystemStats.largestFiles.length > 0) {
    lines.push('#### Largest Files');
    lines.push('');
    
    for (const file of fileSystemStats.largestFiles.slice(0, 5)) {
      const emoji = getFileTypeEmoji(file.type);
      lines.push('- ' + emoji + ' [`' + file.path + '`](../' + file.path + '): ' + formatBytes(file.size));
    }
    lines.push('');
  }

  // Configuration status
  lines.push('### Configuration Status');
  lines.push('');
  
  const existingConfigs = configFiles.filter(c => c.exists);
  const missingConfigs = configFiles.filter(c => !c.exists);
  
  lines.push('- **Valid configs:** ' + existingConfigs.length + '/' + configFiles.length);
  
  if (missingConfigs.length > 0) {
    lines.push('- **Missing configs:** ' + missingConfigs.length + ' files');
    for (const config of missingConfigs) {
      lines.push('  - ❌ `' + config.name + '`');
    }
    lines.push('');
  }

  // Latest configuration updates
  if (existingConfigs.length > 0) {
    lines.push('#### Recent Configuration Changes');
    lines.push('');
    
    const recentConfigs = existingConfigs
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, 3);
    
    for (const config of recentConfigs) {
      const modified = formatRelativeTime(config.lastModified);
      lines.push('- [`' + config.name + '`](../config/' + config.name + ') - updated ' + modified);
    }
    lines.push('');
  }

  // Resource utilization warnings
  lines.push('### Resource Utilization');
  lines.push('');

  // Task capacity analysis
  if (systemData.totalTasks > 1000) {
    lines.push('⚠️ **High task volume:** ' + systemData.totalTasks + ' tasks in system');
    lines.push('');
  }

  // Failed task warnings
  if (systemData.totalTasks > 0) {
    const failureRate = systemData.failedTasks / systemData.totalTasks;
    if (failureRate > 0.1) { // More than 10% failure rate
      lines.push('🔴 **High failure rate:** ' + (failureRate * 100).toFixed(1) + '% of tasks failed');
      lines.push('');
    }
  }

  // Lease utilization
  if (systemData.activeLeases > systemData.activeTasks) {
    lines.push('🟡 **More leases than active tasks:** Possible stale leases detected');
    lines.push('');
  }

  // File system utilization
  if (fileSystemStats.totalSize > 1024 * 1024 * 100) { // More than 100MB
    lines.push('📁 **Large disk usage:** ' + formatBytes(fileSystemStats.totalSize) + ' used by MAF files');
    lines.push('');
  }

  // System recommendations
  lines.push('### Recommendations');
  lines.push('');

  const recommendations = generateRecommendations(systemData, fileSystemStats, configFiles);
  
  if (recommendations.length === 0) {
    lines.push('✅ No immediate actions required');
  } else {
    for (const recommendation of recommendations) {
      lines.push('- ' + recommendation);
    }
  }
  
  lines.push('');

  // System information links
  lines.push('### System Information');
  lines.push('');
  lines.push('- **Database:** SQLite runtime at `.maf/runtime.db`');
  lines.push('- **Configuration:** [`../config/`](../config/) directory');
  lines.push('- **Logs:** [`../logs/`](../logs/) directory');
  lines.push('- **State:** [`../state/`](../state/) directory');
  lines.push('- **Evidence:** Available throughout dashboard sections');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get health emoji for system status
 */
function getHealthEmoji(health: SystemData['systemHealth']): string {
  switch (health) {
    case 'healthy': return '🟢';
    case 'warning': return '🟡';
    case 'critical': return '🔴';
    default: return '⚪';
  }
}

/**
 * Get metric emoji based on value and type
 */
function getMetricEmoji(value: number, type: string): string {
  switch (type) {
    case 'tasks':
      return value > 1000 ? '🔴' : value > 500 ? '🟡' : '🟢';
    case 'active':
      return value > 50 ? '🟡' : '🟢';
    case 'completed':
      return '🟢';
    case 'failed':
      return value > 10 ? '🔴' : value > 5 ? '🟡' : '🟢';
    case 'leases':
      return value > 20 ? '🟡' : '🟢';
    case 'events':
      return value > 10000 ? '🔴' : value > 5000 ? '🟡' : '🟢';
    case 'evidence':
      return value > 1000 ? '🟡' : '🟢';
    default:
      return '🟢';
  }
}

/**
 * Get file type emoji
 */
function getFileTypeEmoji(type: string): string {
  switch (type) {
    case 'log': return '📝';
    case 'config': return '⚙️';
    case 'state': return '💾';
    case 'evidence': return '🔍';
    case 'screenshot': return '📸';
    default: return '📄';
  }
}

/**
 * Generate system recommendations based on current state
 */
function generateRecommendations(
  systemData: SystemData,
  fileSystemStats: SystemSectionData['fileSystemStats'],
  configFiles: SystemSectionData['configFiles']
): string[] {
  const recommendations: string[] = [];

  // Task-related recommendations
  if (systemData.failedTasks > 0) {
    const failureRate = systemData.failedTasks / systemData.totalTasks;
    if (failureRate > 0.2) {
      recommendations.push('🔍 **Investigate high failure rate:** Review error logs and task configurations');
    }
  }

  if (systemData.activeTasks > 100) {
    recommendations.push('📊 **Monitor task backlog:** Consider scaling or task prioritization');
  }

  // Lease-related recommendations
  if (systemData.activeLeases > systemData.activeTasks) {
    recommendations.push('🧹 **Clean up stale leases:** Run system refresh to clear expired leases');
  }

  // File system recommendations
  if (fileSystemStats.totalSize > 1024 * 1024 * 500) { // More than 500MB
    recommendations.push('🗂️ **Archive old logs:** Consider log rotation to free up disk space');
  }

  // Configuration recommendations
  const missingConfigs = configFiles.filter(c => !c.exists);
  if (missingConfigs.length > 0) {
    recommendations.push('⚙️ **Complete configuration:** Add missing config files for full functionality');
  }

  // Evidence recommendations
  if (systemData.totalEvidence === 0 && systemData.totalTasks > 0) {
    recommendations.push('🔍 **Enable evidence collection:** Configure evidence capture for better observability');
  }

  return recommendations;
}

/**
 * Format bytes for human readability
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format relative time for human readability
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) { // Less than 1 minute
    return 'just now';
  } else if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return minutes + ' minute' + (minutes === 1 ? '' : 's') + ' ago';
  } else if (diff < 86400000) { // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
  } else {
    const days = Math.floor(diff / 86400000);
    return days + ' day' + (days === 1 ? '' : 's') + ' ago';
  }
}
