// ABOUTME: Evidence section generator for MAF dashboard
// ABOUTME: Creates markdown section showing evidence, verification results, and compliance status

import type { EvidenceData } from '../collectors/sqlite-collector';
import type { LogEntry, FileSystemArtifact } from '../collectors/filesystem-collector';

export interface EvidenceSectionData {
  evidence: EvidenceData[];
  artifacts: FileSystemArtifact[];
  logEntries: LogEntry[];
  lastUpdated: number;
}

/**
 * Generate evidence section for dashboard
 */
export function generateEvidenceSection(data: EvidenceSectionData): string {
  const { evidence, artifacts, logEntries, lastUpdated } = data;

  const lines = [
    '## 🔍 Evidence & Compliance',
    '',
    '*Last updated: ' + new Date(lastUpdated).toISOString() + '*',
    ''
  ];

  if (evidence.length === 0 && artifacts.length === 0 && logEntries.length === 0) {
    lines.push('No evidence or artifacts found in the system.');
    lines.push('');
    return lines.join('\n');
  }

  // Evidence summary
  if (evidence.length > 0) {
    const passed = evidence.filter(e => e.result === 'PASS').length;
    const failed = evidence.filter(e => e.result === 'FAIL').length;
    const passRate = ((passed / evidence.length) * 100).toFixed(1);

    lines.push('### Verification Summary');
    lines.push('');
    lines.push('| Result | Count | Percentage |');
    lines.push('|--------|-------|------------|');
    lines.push('| ✅ Pass | ' + passed + ' | ' + passRate + '% |');
    lines.push('| ❌ Fail | ' + failed + ' | ' + ((failed / evidence.length) * 100).toFixed(1) + '% |');
    lines.push('| **Total** | **' + evidence.length + '** | **100%** |');
    lines.push('');
  }

  // Recent verification results
  if (evidence.length > 0) {
    lines.push('### Recent Verification Results');
    lines.push('');

    const sortedEvidence = evidence
      .sort((a, b) => b.verifier.localeCompare(a.verifier))
      .slice(0, 20);

    for (const evidenceItem of sortedEvidence) {
      const statusEmoji = evidenceItem.result === 'PASS' ? '✅' : '❌';
      const verifier = evidenceItem.verifier.replace(/_/g, ' ');
      
      lines.push('#### ' + statusEmoji + ' ' + verifier);
      lines.push('');
      lines.push('- **Task:** `' + evidenceItem.taskId + '`');
      lines.push('- **Attempt:** ' + evidenceItem.attempt);
      lines.push('- **Result:** ' + evidenceItem.result);
      
      if (evidenceItem.details) {
        lines.push('- **Details:** ' + formatEvidenceDetails(evidenceItem.details));
      }
      
      // Link to task evidence
      lines.push('- **Evidence:** [Task evidence](../state/' + evidenceItem.taskId + '/)');
      lines.push('');
    }
  }

  // File system artifacts
  if (artifacts.length > 0) {
    lines.push('### File System Artifacts');
    lines.push('');

    // Group artifacts by type
    const artifactsByType = artifacts.reduce((groups, artifact) => {
      if (!groups[artifact.type]) {
        groups[artifact.type] = [];
      }
      groups[artifact.type].push(artifact);
      return groups;
    }, {} as Record<string, FileSystemArtifact[]>);

    for (const [type, typeArtifacts] of Object.entries(artifactsByType)) {
      const typeEmoji = getArtifactTypeEmoji(type);
      const existingArtifacts = typeArtifacts.filter(a => a.exists);
      const totalSize = existingArtifacts.reduce((sum, a) => sum + a.size, 0);
      
      lines.push('#### ' + typeEmoji + ' ' + type.charAt(0).toUpperCase() + type.slice(1) + ' Files');
      lines.push('');
      lines.push('- **Total files:** ' + existingArtifacts.length + ' of ' + typeArtifacts.length);
      lines.push('- **Total size:** ' + formatBytes(totalSize));
      
      if (existingArtifacts.length > 0) {
        lines.push('- **Latest file:** ' + getLatestFile(existingArtifacts));
        lines.push('');
        
        // Show up to 10 most recent files of this type
        const recentFiles = existingArtifacts
          .sort((a, b) => b.lastModified - a.lastModified)
          .slice(0, 10);
        
        for (const artifact of recentFiles) {
          const fileEmoji = artifact.exists ? '✅' : '❌';
          const size = formatBytes(artifact.size);
          const modified = formatRelativeTime(artifact.lastModified);
          
          lines.push('- ' + fileEmoji + ' [`' + artifact.relativePath + '`](../' + artifact.relativePath + ')');
          lines.push('  - Size: ' + size + ', Modified: ' + modified);
        }
      } else {
        lines.push('- *No ' + type + ' files found*');
      }
      
      lines.push('');
    }
  }

  // Recent log entries with errors/warnings
  const significantLogs = logEntries.filter(log => 
    log.level === 'error' || log.level === 'warn'
  ).slice(0, 15);

  if (significantLogs.length > 0) {
    lines.push('### Significant Log Entries');
    lines.push('');

    for (const logEntry of significantLogs) {
      const levelEmoji = getLogLevelEmoji(logEntry.level);
      const time = formatRelativeTime(logEntry.timestamp);
      
      lines.push('- ' + levelEmoji + ' **' + time + '** (' + logEntry.source + '):');
      lines.push('  ' + logEntry.message);
      lines.push('');
    }
  }

  // Compliance indicators
  lines.push('### Compliance Indicators');
  lines.push('');

  if (evidence.length > 0) {
    const failedEvidence = evidence.filter(e => e.result === 'FAIL');
    
    if (failedEvidence.length === 0) {
      lines.push('✅ **All verifications passed** - System is in compliance');
    } else {
      lines.push('❌ **Compliance Issues Found:** ' + failedEvidence.length + ' failed verification(s)');
      
      for (const failure of failedEvidence) {
        lines.push('- `' + failure.taskId + '`: ' + failure.verifier);
      }
    }
    lines.push('');
  }

  // Evidence collection status
  lines.push('### Evidence Collection Status');
  lines.push('');
  lines.push('- **Database evidence:** ' + evidence.length + ' records');
  lines.push('- **File artifacts:** ' + artifacts.filter(a => a.exists).length + ' files');
  lines.push('- **Log entries:** ' + logEntries.length + ' entries');
  lines.push('- **Significant events:** ' + significantLogs.length + ' entries');
  lines.push('');

  // Links to detailed evidence
  lines.push('### Detailed Evidence Links');
  lines.push('');
  lines.push('- **Raw logs:** [`../logs/`](../logs/)');
  lines.push('- **Configuration files:** [`../config/`](../config/)');
  lines.push('- **State snapshots:** [`../state/`](../state/)');
  lines.push('- **Test results:** [`../test-results/`](../test-results/)');
  lines.push('- **Monitoring data:** [`../monitoring/`](../monitoring/)');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get artifact type emoji
 */
function getArtifactTypeEmoji(type: string): string {
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
 * Get log level emoji
 */
function getLogLevelEmoji(level: LogEntry['level']): string {
  switch (level) {
    case 'error': return '🔴';
    case 'warn': return '🟡';
    case 'info': return '🔵';
    case 'debug': return '⚪';
    default: return '📝';
  }
}

/**
 * Format evidence details
 */
function formatEvidenceDetails(details: any): string {
  if (!details || typeof details !== 'object') {
    return 'No details available';
  }

  if (details.checks && details.passed !== undefined) {
    return details.checks + ' checks, ' + details.passed + ' passed' + 
           (details.warnings ? ', ' + details.warnings + ' warnings' : '');
  }

  if (details.message) {
    return details.message;
  }

  if (details.error) {
    return 'Error: ' + details.error;
  }

  return JSON.stringify(details, null, 2).substring(0, 100) + '...';
}

/**
 * Get latest file from artifacts
 */
function getLatestFile(artifacts: FileSystemArtifact[]): string {
  if (artifacts.length === 0) return 'None';
  
  const latest = artifacts.reduce((prev, current) => 
    current.lastModified > prev.lastModified ? current : prev
  );
  
  return '`' + latest.relativePath + '` (' + formatRelativeTime(latest.lastModified) + ')';
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
