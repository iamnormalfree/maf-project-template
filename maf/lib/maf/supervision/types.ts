// ABOUTME: Supervision types for MAF supervisor data collection and decision-making.
// ABOUTME: Defines three-layer pipeline: Raw JSON → Collected Data → Supervision Context

import type { MafHeartbeat } from '../core/runtime-state';

// Re-export threshold types for convenience
export type {
  ResourceUsage,
  Threshold,
  ThresholdConfig,
  ThresholdCheckResult,
  ThresholdViolation,
  ThresholdAlert
} from './threshold-manager';

export { DEFAULT_THRESHOLD_CONFIG } from './threshold-manager';

// ============================================================================
// LAYER 1: Raw JSON from bash script (tmux-agent-monitor.sh json-detailed)
// ============================================================================

export interface TmuxMonitorRawOutput {
  timestamp: string;
  session: string;
  window: string;
  agents: AgentJsonData[];
  system: SystemJsonData;
}

export interface AgentJsonData {
  paneIndex: number;
  paneId: string;
  agentName: string;
  agentRole: string;
  status: 'busy' | 'idle' | 'prompted_recent' | 'prompted_earlier' | 'unknown';
  lastActivity: string;
  command: string;
  size: {
    width: number;
    height: number;
  };
  history: {
    lastLine: string;
    promptDetected: boolean;
    mafStatus: string;
  };
  recentActivity: string[];
}

export interface SystemJsonData {
  sessionName: string;
  windowName: string;
  sessionCreated: string;
  sessionCount: number;
  windowCount: number;
  paneCount: number;
  tmuxMemory: string;
  serverRunning: boolean;
}

// ============================================================================
// LAYER 2: Collected data (internal representation)
// ============================================================================

export interface CollectedAgentData {
  agentId: string;
  paneIndex: number;
  paneId: string;
  agentName: string;
  agentRole: string;
  heartbeat: MafHeartbeat;
  tmuxSession: TmuxSessionInfo;
  lastActivity: string;
  activityTimestamp: number;
  recentActivity: string[];
  collectedAt: number;
}

export interface TmuxSessionInfo {
  sessionName: string;
  windowName: string;
  paneIndex: number;
  paneId: string;
  command: string;
  size: {
    width: number;
    height: number;
  };
}

export interface SystemMetrics {
  sessionName: string;
  windowName: string;
  sessionCreated: string;
  sessionCount: number;
  windowCount: number;
  paneCount: number;
  tmuxMemoryMb: number;
  serverRunning: boolean;
  timestamp: number;
}

export interface CollectedData {
  agents: CollectedAgentData[];
  system: SystemMetrics;
  collectedAt: number;
  source: 'tmux' | 'fallback';
  warnings: string[];
}

// ============================================================================
// LAYER 3: Supervision context (view model - consumed by supervisor)
// ============================================================================

export interface AgentState {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'blocked' | 'unknown';
  lastSeen: Date;
  paneIndex?: number;
  sessionId?: string;
  contextUsage?: number;
}

export interface AgentSession {
  agentId: string;
  sessionId: string;
  startTime: Date;
  paneIndex: number;
  agentName: string;
  agentRole: string;
}

export interface SupervisionContext {
  agents: AgentState[];
  sessions: AgentSession[];
  systemHealth: {
    tmuxRunning: boolean;
    sessionCount: number;
    paneCount: number;
    memoryMb: number;
  };
  timestamp: number;
}

// ============================================================================
// Other supervision types (preserved for backward compatibility)
// ============================================================================

export interface SupervisorAction {
  type: string;
  target: string;
  parameters?: any;
}

export interface SupervisorCliConfig {
  dbPath?: string;
  logLevel?: string;
}

export interface SupervisorDecision {
  action: SupervisorAction;
  reasoning: string;
  confidence: number;
}

export interface SupervisionConfig {
  checkInterval: number;
  thresholds: any;
}

// ============================================================================
// Session and Agent Supervision Types (used by supervisor.ts)
// ============================================================================

export enum SessionState {
  ACTIVE = 'active',
  PAUSED = 'paused',
  TERMINATED = 'terminated'
}

export enum SystemHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  CRITICAL = 'critical'
}

export enum LoadLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Resource usage metrics for an agent (used by supervisor.ts)
 * Re-exported from threshold-manager for backward compatibility
 */
export interface AgentResourceUsage {
  contextTokens: number;
  contextCapacity: number;
  cpuPercent: number;
  memoryMb: number;
}

/**
 * Agent supervision state (used by supervisor.ts)
 */
export interface AgentSupervisionState {
  agentId: string;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  contextUsagePercent: number;
  taskState: string;
  lastSeen: number;
  agentType: string;
  resourceUsage: AgentResourceUsage;
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    avgTaskDuration: number;
    successRate: number;
    escalationsInitiated: number;
    interventionsReceived: number;
    currentStreak: number;
    performanceTrend: 'improving' | 'stable' | 'declining';
  };
  supervision: {
    supervisionStarted: number;
    lastSupervisionCheck: number;
    complianceHistory: string[];
  };
  supervisionHistory: string[];
  interventionHistory: string[];
  thresholdViolations: string[];
  supervisionLevel: 'standard' | 'elevated' | 'intensive';
}

/**
 * Supervision session (used by supervisor.ts)
 */
export interface SupervisionSession {
  sessionId: string;
  startedAt: number;
  state: SessionState;
  config: any;
  statistics: {
    totalDecisions: number;
    totalInterventions: number;
    totalThresholdViolations: number;
    totalEventsProcessed: number;
    avgDecisionTimeMs: number;
    avgInterventionTimeMs: number;
    interventionSuccessRate: number;
    escalationRate: number;
  };
}

/**
 * Supervisor status (used by supervisor.ts)
 */
export interface SupervisorStatus {
  supervisorId: string;
  state: 'running' | 'paused' | 'stopped';
  sessionId: string;
  uptime: number;
  lastCheck: number;
  activeAgents: number;
}

/**
 * Supervisor metrics (used by supervisor.ts)
 */
export interface SupervisorMetrics {
  totalChecks: number;
  totalInterventions: number;
  totalViolations: number;
  successRate: number;
  avgResponseTime: number;
}
