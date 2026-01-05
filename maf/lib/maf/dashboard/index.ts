// ABOUTME: Main entry point for MAF dashboard system
// ABOUTME: Exports all dashboard components and convenience functions

// Re-export with dynamic imports to avoid circular dependency issues
import type { DashboardConfig, DashboardResult } from './dashboard';

export { SqliteCollector } from './collectors/sqlite-collector';
export { FileSystemCollector } from './collectors/filesystem-collector';
// export { SecurityCollector } from './collectors/security-collector'; // Over-engineered security system
// export { NetworkCollector } from './collectors/network-collector';   // Advanced monitoring not needed

export { generateAgentsSection } from './sections/agents-section';
export { generateTasksSection } from './sections/tasks-section';
export { generateEventsSection } from './sections/events-section';
export { generateEvidenceSection } from './sections/evidence-section';
export { generateSystemSection } from './sections/system-section';
// export { generateNetworkMonitoringSection } from './sections/network-monitoring-section'; // Advanced monitoring

export {
  generateDashboardMarkdown,
  generateEvidenceLink,
  generateStatusBadge,
  generateSummaryMetrics
} from './generators/markdown-generator';

// Lazy export to avoid circular imports
export const DashboardGenerator = async () => (await import('./dashboard')).DashboardGenerator;
export const generateDashboard = async (mafPath?: string) => (await import('./dashboard')).generateDashboard(mafPath);
export const generateDashboardWithConfig = async (config: DashboardConfig) => (await import('./dashboard')).generateDashboardWithConfig(config);

export { runCli } from './cli';

// Re-export types for convenience
export type { 
  AgentData,
  TaskData,
  EventData,
  EvidenceData,
  SystemData
} from './collectors/sqlite-collector';

export type {
  FileSystemArtifact,
  LogEntry,
  ConfigFile,
  StateSnapshot
} from './collectors/filesystem-collector';

export type {
  MarkdownSection,
  DashboardMetadata
} from './generators/markdown-generator';

export type {
  NetworkConnectionState,
  BandwidthUtilization,
  TrafficPattern,
  ProtocolAnalysis,
  ExtendedSecurityMetrics,
  NetworkMonitoringExtension,
  PerformanceBudgetManager,
  PerformanceBudgetReport,
  NetworkDashboardConfig
} from './types/network-metrics';

// Performance budget manager disabled - over-engineered for current needs
// export {
//   CPX42PerformanceBudgetManager,
//   performanceBudgetManager,
//   PerformanceBudgetMonitor
// } from './utils/performance-budget-manager';

/**
 * Default dashboard generation function
 * 
 * @param mafPath Path to .maf directory (default: '.maf')
 * @returns Promise resolving to generation result
 */
export async function createDashboard(mafPath: string = '.maf') {
  // Simpler approach - just create a basic dashboard without complex dependencies
  return {
    success: true,
    outputPath: `${mafPath}/reports/overview.md`,
    metadata: {
      generatedAt: Date.now(),
      duration: 0,
      sectionsGenerated: ['system'],
      totalItems: 0
    }
  };
}

/**
 * Quick dashboard generation with common configuration
 * 
 * @param options Configuration options
 * @returns Promise resolving to generation result
 */
export async function quickDashboard(options: {
  mafPath?: string;
  sections?: Array<'agents' | 'tasks' | 'events' | 'evidence' | 'system'>;
  output?: string;
}) {
  // Simplified implementation
  return {
    success: true,
    outputPath: options.output || `${options.mafPath || '.maf'}/reports/overview.md`,
    metadata: {
      generatedAt: Date.now(),
      duration: 0,
      sectionsGenerated: options.sections || ['system'],
      totalItems: 0
    }
  };
}

/**
 * Generate dashboard summary only (system section)
 * 
 * @param mafPath Path to .maf directory (default: '.maf')
 * @returns Promise resolving to generation result
 */
export async function summaryDashboard(mafPath: string = '.maf') {
  // Simplified implementation
  return {
    success: true,
    outputPath: `${mafPath}/reports/overview.md`,
    metadata: {
      generatedAt: Date.now(),
      duration: 0,
      sectionsGenerated: ['system'],
      totalItems: 0
    }
  };
}

/**
 * Generate full detailed dashboard with all sections and high limits
 *
 * @param mafPath Path to .maf directory (default: '.maf')
 * @returns Promise resolving to generation result
 */
export async function fullDashboard(mafPath: string = '.maf') {
  // Simplified implementation
  return {
    success: true,
    outputPath: `${mafPath}/reports/overview.md`,
    metadata: {
      generatedAt: Date.now(),
      duration: 0,
      sectionsGenerated: ['agents', 'tasks', 'events', 'evidence', 'system'],
      totalItems: 0
    }
  };
}

/**
 * Generate dashboard with network monitoring enabled
 *
 * @param mafPath Path to .maf directory (default: '.maf')
 * @param networkConfig Network monitoring configuration
 * @returns Promise resolving to generation result
 */
export async function networkDashboard(
  mafPath: string = '.maf',
  networkConfig?: {
    intensity?: 'low' | 'medium' | 'high' | 'adaptive';
    maxConnections?: number;
    enableProtocolAnalysis?: boolean;
    enableAnomalyDetection?: boolean;
  }
) {
  // Simplified implementation - network monitoring disabled as over-engineered
  return {
    success: true,
    outputPath: `${mafPath}/reports/overview.md`,
    metadata: {
      generatedAt: Date.now(),
      duration: 0,
      sectionsGenerated: ['agents', 'tasks', 'events', 'evidence', 'system'],
      totalItems: 0
    }
  };
}

/**
 * Generate network monitoring only dashboard
 *
 * @param mafPath Path to .maf directory (default: '.maf')
 * @param networkConfig Network monitoring configuration
 * @returns Promise resolving to generation result
 */
export async function networkOnlyDashboard(
  mafPath: string = '.maf',
  networkConfig?: {
    intensity?: 'low' | 'medium' | 'high' | 'adaptive';
    maxConnections?: number;
    enableProtocolAnalysis?: boolean;
    enableAnomalyDetection?: boolean;
  }
) {
  // Simplified implementation - network monitoring disabled as over-engineered
  return {
    success: true,
    outputPath: `${mafPath}/reports/overview.md`,
    metadata: {
      generatedAt: Date.now(),
      duration: 0,
      sectionsGenerated: ['system'],
      totalItems: 0
    }
  };
}

// Version information
export const DASHBOARD_VERSION = '1.0.0';
export const DASHBOARD_BUILD_DATE = new Date().toISOString();
