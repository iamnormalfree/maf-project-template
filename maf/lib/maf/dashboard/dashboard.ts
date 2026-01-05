// ABOUTME: Main dashboard orchestrator for MAF system
// ABOUTME: Generates comprehensive markdown dashboard with modular sections and evidence linking

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { SqliteCollector } from './collectors/sqlite-collector';
import { FileSystemCollector } from './collectors/filesystem-collector';
// import { SecurityCollector } from './collectors/security-collector'; // Over-engineered security
import { generateAgentsSection } from './sections/agents-section';
import { generateTasksSection } from './sections/tasks-section';
import { generateEventsSection } from './sections/events-section';
import { generateEvidenceSection } from './sections/evidence-section';
import { generateSystemSection } from './sections/system-section';
// import { generateNetworkMonitoringSection } from './sections/network-monitoring-section'; // Advanced monitoring
import { generateDashboardMarkdown, type MarkdownSection } from './generators/markdown-generator';

export interface DashboardConfig {
  mafPath: string;
  outputPath?: string;
  includeSections?: Array<'agents' | 'tasks' | 'events' | 'evidence' | 'system' | 'security' | 'network'>;
  limits?: {
    tasks?: number;
    events?: number;
    evidence?: number;
    logEntries?: number;
  };
  networkMonitoring?: {
    enabled?: boolean;
    intensity?: 'low' | 'medium' | 'high' | 'adaptive';
    maxConnections?: number;
    enableProtocolAnalysis?: boolean;
    enableAnomalyDetection?: boolean;
  };
}

export interface DashboardResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  metadata: {
    generatedAt: number;
    duration: number;
    sectionsGenerated: string[];
    totalItems: number;
  };
}

/**
 * Main dashboard orchestrator
 */
export class DashboardGenerator {
  private readonly sqliteCollector: SqliteCollector;
  private readonly filesystemCollector: FileSystemCollector;
  // private readonly securityCollector: SecurityCollector; // Over-engineered security
  private readonly config: Required<DashboardConfig>;

  constructor(config: DashboardConfig) {
    this.config = {
      mafPath: config.mafPath,
      outputPath: config.outputPath || join(config.mafPath, 'reports', 'overview.md'),
      includeSections: config.includeSections || ['agents', 'tasks', 'events', 'evidence', 'system', 'security'],
      limits: {
        tasks: config.limits?.tasks || 100,
        events: config.limits?.events || 50,
        evidence: config.limits?.evidence || 50,
        logEntries: config.limits?.logEntries || 100
      },
      networkMonitoring: {
        enabled: config.networkMonitoring?.enabled || false,
        intensity: config.networkMonitoring?.intensity || 'adaptive',
        maxConnections: config.networkMonitoring?.maxConnections || 1000,
        enableProtocolAnalysis: config.networkMonitoring?.enableProtocolAnalysis || true,
        enableAnomalyDetection: config.networkMonitoring?.enableAnomalyDetection || true
      }
    };

    this.sqliteCollector = new SqliteCollector();
    this.filesystemCollector = new FileSystemCollector(this.config.mafPath);

    // Initialize security collector with network monitoring if enabled
    // this.securityCollector = new SecurityCollector(
    //   this.config.mafPath,
    //   this.config.networkMonitoring.enabled || false
    // ); // Over-engineered security
  }

  /**
   * Generate complete dashboard
   */
  async generate(): Promise<DashboardResult> {
    const startTime = Date.now();
    const metadata = {
      generatedAt: startTime,
      duration: 0,
      sectionsGenerated: [] as string[],
      totalItems: 0
    };

    let dashboardContent = '';

    try {
      console.log('Starting dashboard generation...');
      
      // Collect all data
      const collectedData = await this.collectAllData();
      metadata.totalItems = this.calculateTotalItems(collectedData);
      
      // Generate sections
      const sections = await this.generateSections(collectedData);
      metadata.sectionsGenerated = sections.map(s => s.title);
      
      // Generate final markdown
      dashboardContent = generateDashboardMarkdown(sections, {
        generatedAt: startTime,
        version: '1.0.0',
        source: 'MAF Dashboard System',
        mafPath: this.config.mafPath
      });
      
    } catch (error) {
      metadata.duration = Date.now() - startTime;
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Dashboard generation failed:', errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        metadata
      };
    }

    let writeError: string | undefined;
    try {
      await this.ensureOutputDirectory();
      await writeFile(this.config.outputPath, dashboardContent, 'utf8');
      console.log('Dashboard generated successfully at:', this.config.outputPath);
      console.log('Generated', metadata.sectionsGenerated.length, 'sections with', metadata.totalItems, 'total items');
    } catch (error) {
      writeError = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Dashboard write skipped:', writeError);
    }

    metadata.duration = Date.now() - startTime;
    
    return {
      success: true,
      outputPath: writeError ? undefined : this.config.outputPath,
      error: writeError,
      metadata
    };
  }

  /**
   * Collect all required data from sources
   */
  private async collectAllData() {
    console.log('Collecting data from sources...');

    // Security metrics collection disabled - over-engineered for current needs
    // const securityMetricsPromise = this.config.networkMonitoring.enabled
    //   ? this.securityCollector.collectExtendedSecurityMetrics()
    //   : this.securityCollector.collectSecurityMetrics();
    const securityMetricsPromise = Promise.resolve({
      policyValid: false,
      policyFile: '',
      allowlistDomains: 0,
      allowlistFile: '',
      currentProfile: 'unknown',
      recentSecurityEvents: 0,
      auditLog: '',
      lastBoundaryTest: 'unknown',
      boundaryTestStatus: 'unknown',
      overallSecurityHealth: 'warning',
      isolationEffectiveness: 0,
      performanceImpact: 0,
      networkMonitoring: null,
      securityViolations: [],
      trendData: []
    });

    const [
      agents,
      tasks,
      events,
      evidence,
      systemStats,
      recentActivity,
      artifacts,
      logEntries,
      configFiles,
      stateSnapshots,
      fileSystemStats,
      securityMetrics
    ] = await Promise.allSettled([
      this.sqliteCollector.collectAgents(),
      this.sqliteCollector.collectTasks(this.config.limits.tasks),
      this.sqliteCollector.collectEvents(this.config.limits.events),
      this.sqliteCollector.collectEvidence(this.config.limits.evidence),
      this.sqliteCollector.collectSystemStats(),
      this.sqliteCollector.getRecentActivity(),
      this.filesystemCollector.scanArtifacts(),
      this.filesystemCollector.collectLogEntries(this.config.limits.logEntries),
      this.filesystemCollector.scanConfigFiles(),
      this.filesystemCollector.collectStateSnapshots(),
      this.filesystemCollector.getFileSystemStats(),
      securityMetricsPromise
    ]);

    return {
      agents: this.getResultValue(agents, []),
      tasks: this.getResultValue(tasks, []),
      events: this.getResultValue(events, []),
      evidence: this.getResultValue(evidence, []),
      systemStats: this.getResultValue(systemStats, {
        totalTasks: 0,
        activeTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        totalEvents: 0,
        totalEvidence: 0,
        activeLeases: 0,
        systemHealth: 'healthy' as const
      }),
      recentActivity: this.getResultValue(recentActivity, []),
      artifacts: this.getResultValue(artifacts, []),
      logEntries: this.getResultValue(logEntries, []),
      configFiles: this.getResultValue(configFiles, []),
      stateSnapshots: this.getResultValue(stateSnapshots, []),
      fileSystemStats: this.getResultValue(fileSystemStats, {
        totalFiles: 0,
        totalSize: 0,
        filesByType: {},
        largestFiles: []
      }),
      securityMetrics: this.getResultValue(securityMetrics, {
        policyValid: false,
        policyFile: '',
        allowlistDomains: 0,
        allowlistFile: '',
        currentProfile: 'unknown',
        recentSecurityEvents: 0,
        auditLog: '',
        lastBoundaryTest: 'unknown',
        boundaryTestStatus: 'unknown',
        overallSecurityHealth: 'warning',
        isolationEffectiveness: 0,
        performanceImpact: 0,
        networkMonitoring: null,
        securityViolations: [],
        trendData: []
      })
    };
  }

  /**
   * Generate all enabled sections
   */
  private async generateSections(data: any): Promise<MarkdownSection[]> {
    const sections: MarkdownSection[] = [];
    const now = Date.now();

    console.log('Generating dashboard sections...');

    if (this.config.includeSections.includes('agents')) {
      console.log('  Generating agents section...');
      sections.push({
        title: '🤖 Agents Overview',
        content: generateAgentsSection({
          agents: data.agents,
          stateSnapshots: data.stateSnapshots,
          lastUpdated: now
        }),
        order: 1
      });
    }

    if (this.config.includeSections.includes('tasks')) {
      console.log('  Generating tasks section...');
      sections.push({
        title: '📋 Tasks Overview',
        content: generateTasksSection({
          tasks: data.tasks,
          events: data.events,
          lastUpdated: now
        }),
        order: 2
      });
    }

    if (this.config.includeSections.includes('events')) {
      console.log('  Generating events section...');
      sections.push({
        title: '📅 System Events',
        content: generateEventsSection({
          events: data.events,
          lastUpdated: now
        }),
        order: 3
      });
    }

    if (this.config.includeSections.includes('evidence')) {
      console.log('  Generating evidence section...');
      sections.push({
        title: '🔍 Evidence & Compliance',
        content: generateEvidenceSection({
          evidence: data.evidence,
          artifacts: data.artifacts,
          logEntries: data.logEntries,
          lastUpdated: now
        }),
        order: 4
      });
    }

    if (this.config.includeSections.includes('system')) {
      console.log('  Generating system section...');
      sections.push({
        title: '🖥️ System Overview',
        content: generateSystemSection({
          systemData: data.systemStats,
          fileSystemStats: data.fileSystemStats,
          configFiles: data.configFiles,
          lastUpdated: now
        }),
        order: 5
      });
    }

    if (this.config.includeSections.includes('security')) {
      console.log('  Generating security section...');
      sections.push({
        title: '🔒 Security Overview',
        content: this.generateSecuritySection({
          securityData: data.securityMetrics,
          lastUpdated: now
        }),
        order: 6
      });
    }

    // Advanced network monitoring disabled - over-engineered for current needs
    // if (this.config.includeSections.includes('network')) {
    //   console.log('  Generating network monitoring section...');
    //   sections.push({
    //     title: '🌐 Network Monitoring',
    //     content: generateNetworkMonitoringSection({
    //       networkData: data.securityMetrics.networkMonitoring || {
    //         connectionStates: [],
    //         bandwidthUtilization: {
    //           timestamp: now,
    //           interfaceName: 'eth0',
    //           bytesInPerSecond: 0,
    //           bytesOutPerSecond: 0,
    //           packetsInPerSecond: 0,
    //           packetsOutPerSecond: 0,
    //           totalBandwidth: 1000000000,
    //           utilizationPercentage: 0,
    //           rateLimitStatus: 'within_limits' as const,
    //           connectionCount: 0,
    //           activeConnections: 0,
    //           peakUtilization: 0,
    //           averageUtilization: 0
    //         },
    //         trafficPatterns: [],
    //         protocolAnalysis: [],
    //         monitoringIntensity: this.config.networkMonitoring.intensity || 'adaptive',
    //         performanceBudget: {
    //           allocated: 2.0,
    //           used: 0,
    //           available: 2.0,
    //           efficiency: 0
    //         },
    //         lastUpdated: now
    //       },
    //       lastUpdated: now,
    //       config: this.config.networkMonitoring
    //     }),
    //     order: 7
    //   });
    // }

    return sections;
  }

  /**
   * Generate security section for dashboard
   */
  private generateSecuritySection(data: { securityData: any; lastUpdated: number }): string {
    const { securityData, lastUpdated } = data;

    const lines = [
      '## 🔒 Security Overview',
      '',
      '*Last updated: ' + new Date(lastUpdated).toISOString() + '*',
      ''
    ];

    // Security health status
    const healthEmoji = getSecurityHealthEmoji(securityData.overallSecurityHealth);
    lines.push('### Security Health: ' + healthEmoji + ' ' + securityData.overallSecurityHealth.toUpperCase());
    lines.push('');

    if (securityData.overallSecurityHealth === 'critical') {
      lines.push('🚨 **CRITICAL SECURITY ISSUES** - Immediate attention required');
      lines.push('');
    } else if (securityData.overallSecurityHealth === 'warning') {
      lines.push('⚠️ **SECURITY WARNING** - Review security configuration');
      lines.push('');
    } else {
      lines.push('✅ **Security posture is healthy**');
      lines.push('');
    }

    // Security metrics table
    lines.push('### Security Metrics');
    lines.push('');
    lines.push('| Metric | Value | Status |');
    lines.push('|--------|-------|--------|');
    lines.push('| **Policy Valid** | ' + (securityData.policyValid ? '✅ Valid' : '❌ Invalid') + ' | ' + (securityData.policyValid ? '🟢' : '🔴') + ' |');
    lines.push('| **Current Profile** | ' + securityData.currentProfile + ' | ' + getProfileEmoji(securityData.currentProfile) + ' |');
    lines.push('| **Allowed Domains** | ' + securityData.allowlistDomains + ' | ' + getDomainCountEmoji(securityData.allowlistDomains) + ' |');
    lines.push('| **Recent Violations** | ' + securityData.recentSecurityEvents + ' (24h) | ' + getViolationEmoji(securityData.recentSecurityEvents) + ' |');
    lines.push('| **Isolation Effectiveness** | ' + securityData.isolationEffectiveness + '% | ' + getEffectivenessEmoji(securityData.isolationEffectiveness) + ' |');
    lines.push('| **Performance Impact** | ' + securityData.performanceImpact + '% | ' + getPerformanceEmoji(securityData.performanceImpact) + ' |');
    lines.push('| **Boundary Test Status** | ' + securityData.boundaryTestStatus + ' | ' + getBoundaryTestEmoji(securityData.boundaryTestStatus) + ' |');
    lines.push('');

    // Security controls status
    lines.push('### Security Controls Status');
    lines.push('');

    // Policy file status
    const policyStatus = securityData.policyValid ? '✅ Valid' : '❌ Invalid';
    lines.push('- **Security Policy:** ' + policyStatus + ' (`' + securityData.policyFile.split('/').pop() + '`)');

    // Domain allowlist status
    const allowlistStatus = securityData.allowlistDomains > 0 ? '✅ Active' : '⚠️ Empty';
    lines.push('- **Domain Allowlist:** ' + allowlistStatus + ' (' + securityData.allowlistDomains + ' domains)');

    // Boundary test status
    const boundaryStatus = securityData.boundaryTestStatus === 'passed' ? '✅ Passed' : '❌ Failed';
    lines.push('- **Boundary Testing:** ' + boundaryStatus + ' (Last: ' + formatRelativeTime(new Date(securityData.lastBoundaryTest).getTime()) + ')');
    lines.push('');

    // Recent security violations
    if (securityData.securityViolations.length > 0) {
      lines.push('### Recent Security Violations');
      lines.push('');

      for (const violation of securityData.securityViolations.slice(0, 5)) {
        const timestamp = formatRelativeTime(violation.timestamp);
        const eventType = violation.event_type || 'unknown';
        lines.push('- **' + eventType + '** - ' + timestamp + (violation.details?.reason ? ' | ' + violation.details.reason : ''));
      }
      lines.push('');
    }

    // Security trends
    if (securityData.trendData.length > 0) {
      lines.push('### Security Trends');
      lines.push('');

      for (const trend of securityData.trendData) {
        const date = new Date(trend.timestamp).toLocaleDateString();
        const violations = trend.violations || 0;
        const effectiveness = trend.effectiveness || 0;
        const status = violations === 0 ? '🟢' : violations <= 2 ? '🟡' : '🔴';

        lines.push('- **' + date + ':** ' + violations + ' violations, ' + effectiveness + '% effectiveness ' + status);
      }
      lines.push('');
    }

    // Security recommendations
    lines.push('### Security Recommendations');
    lines.push('');

    const recommendations = generateSecurityRecommendations(securityData);

    if (recommendations.length === 0) {
      lines.push('✅ No immediate security actions required');
    } else {
      for (const recommendation of recommendations) {
        lines.push('- ' + recommendation);
      }
    }
    lines.push('');

    // Security information links
    lines.push('### Security Information');
    lines.push('');
    lines.push('- **Security Policy:** [`../policy/policy.json`](../lib/maf/policy/policy.json)');
    lines.push('- **Domain Allowlist:** [`../security/domain-allowlist.json`](../lib/maf/security/domain-allowlist.json)');
    lines.push('- **Audit Log:** [`../logs/security-admin.log`](../runtime/logs/security-admin.log)');
    lines.push('- **Security Admin:** `./scripts/maf/security-admin.sh`');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Ensure output directory exists
   */
  private async ensureOutputDirectory(): Promise<void> {
    const outputDir = this.config.outputPath.substring(0, this.config.outputPath.lastIndexOf('/'));
    
    try {
      await mkdir(outputDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Get value from PromiseSettledResult
   */
  private getResultValue<T>(result: PromiseSettledResult<T>, defaultValue: T): T {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.warn('Data collection failed:', result.reason);
      return defaultValue;
    }
  }

  /**
   * Calculate total items collected for metadata
   */
  private calculateTotalItems(data: any): number {
    return (
      data.agents.length +
      data.tasks.length +
      data.events.length +
      data.evidence.length +
      data.artifacts.length +
      data.logEntries.length +
      data.configFiles.length +
      data.stateSnapshots.length
    );
  }
}

/**
 * Generate dashboard with default configuration
 */
export async function generateDashboard(mafPath: string = '.maf'): Promise<DashboardResult> {
  const generator = new DashboardGenerator({
    mafPath
  });
  
  return generator.generate();
}

/**
 * Generate dashboard with custom configuration
 */
export async function generateDashboardWithConfig(config: DashboardConfig): Promise<DashboardResult> {
  const generator = new DashboardGenerator(config);

  return generator.generate();
}

/**
 * Security utility functions
 */

function getSecurityHealthEmoji(health: string): string {
  switch (health) {
    case 'healthy': return '🟢';
    case 'warning': return '🟡';
    case 'critical': return '🔴';
    default: return '⚪';
  }
}

function getProfileEmoji(profile: string): string {
  switch (profile) {
    case 'restricted': return '🔒';
    case 'standard': return '🟡';
    case 'permissive': return '🟢';
    default: return '⚪';
  }
}

function getDomainCountEmoji(count: number): string {
  if (count === 0) return '🔴';
  if (count < 5) return '🟡';
  return '🟢';
}

function getViolationEmoji(count: number): string {
  if (count === 0) return '🟢';
  if (count <= 2) return '🟡';
  return '🔴';
}

function getEffectivenessEmoji(efficiency: number): string {
  if (efficiency >= 95) return '🟢';
  if (efficiency >= 80) return '🟡';
  return '🔴';
}

function getPerformanceEmoji(impact: number): string {
  if (impact <= 5) return '🟢';
  if (impact <= 10) return '🟡';
  return '🔴';
}

function getBoundaryTestEmoji(status: string): string {
  switch (status) {
    case 'passed': return '🟢';
    case 'failed': return '🔴';
    case 'unknown': return '⚪';
    default: return '🔴';
  }
}

function generateSecurityRecommendations(securityData: any): string[] {
  const recommendations: string[] = [];

  // Policy recommendations
  if (!securityData.policyValid) {
    recommendations.push('🔧 **Fix security policy:** Policy validation failed - check syntax and required sections');
  }

  // Domain allowlist recommendations
  if (securityData.allowlistDomains === 0) {
    recommendations.push('🌐 **Configure domain allowlist:** No domains allowed - review network access requirements');
  } else if (securityData.allowlistDomains > 50) {
    recommendations.push('📋 **Review domain allowlist:** High number of domains - consider consolidation');
  }

  // Violation recommendations
  if (securityData.recentSecurityEvents > 10) {
    recommendations.push('🚨 **High violation rate:** ' + securityData.recentSecurityEvents + ' violations - investigate security configuration');
  } else if (securityData.recentSecurityEvents > 5) {
    recommendations.push('⚠️ **Elevated violations:** ' + securityData.recentSecurityEvents + ' violations - review security logs');
  }

  // Effectiveness recommendations
  if (securityData.isolationEffectiveness < 80) {
    recommendations.push('🛡️ **Improve isolation:** Effectiveness ' + securityData.isolationEffectiveness + '% - tighten security controls');
  }

  // Performance recommendations
  if (securityData.performanceImpact > 10) {
    recommendations.push('⚡ **Optimize performance:** ' + securityData.performanceImpact + '% impact - review security overhead');
  }

  // Boundary test recommendations
  if (securityData.boundaryTestStatus === 'failed') {
    recommendations.push('🔬 **Fix boundary tests:** Security isolation validation failed - review configuration');
  } else if (securityData.boundaryTestStatus === 'unknown') {
    recommendations.push('🧪 **Run boundary tests:** Security isolation not tested - validate system boundaries');
  }

  return recommendations;
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
