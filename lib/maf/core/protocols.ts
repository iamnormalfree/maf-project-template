// ABOUTME: Defines typed envelopes exchanged between agents, beads, and supervision layers.
// ABOUTME: Keeps schema parity with upstream tools while remaining implementation agnostic.

export interface MafTaskClaim {
  type: 'TASK_CLAIM';
  agentId: string;
  beadId: string;
  files: string[];
  etaMinutes: number;
  timestamp?: number;
}

export interface MafWorkComplete {
  type: 'WORK_COMPLETE';
  agentId: string;
  beadId: string;
  tests: {
    passed: boolean;
    command: string;
    outputPath?: string;
  };
  commit?: string;
  notes?: string;
  timestamp?: number;
}

export interface MafEscalationRequest {
  type: 'ESCALATION_REQUEST';
  agentId: string;
  executionId: string;
  escalationId: string;
  pathId: string;
  level: number;
  context: any;
  reason: string;
  timestamp?: number;
}

export interface MafEscalationResponse {
  type: 'ESCALATION_RESPONSE';
  agentId: string;
  escalationId: string;
  accepted: boolean;
  message?: string;
  timestamp?: number;
}

export interface MafPreflightCheck {
  type: 'PREFLIGHT_CHECK';
  agentId: string;
  configId: string;
  executionId: string;
  checkType: 'smoke_test' | 'reservation_check' | 'escalation_path' | 'preflight_validation';
  context: Record<string, any>;
  timestamp?: number;
}

export interface MafPreflightResult {
  type: 'PREFLIGHT_RESULT';
  agentId: string;
  executionId: string;
  status: 'passed' | 'failed' | 'warnings';
  checkType: string;
  duration: number;
  result: {
    validations: Record<string, any>;
    errors: string[];
    warnings: string[];
  };
  timestamp?: number;
}

export interface MafPreflightExecutionStored {
  type: 'PREFLIGHT_EXECUTION_STORED';
  executionId: string;
  agentId: string;
  data: any;
  timestamp?: number;
}

export interface MafReservationCheck {
  type: 'RESERVATION_CHECK';
  agentId: string;
  stagedFiles: string[];
  allowOverride: boolean;
  conflicts?: Array<{
    filePath: string;
    leasedBy: string;
    expiresAt: number;
    leaseReason?: string;
  }>;
  timestamp?: number;
}

export interface MafAgentRegistered {
  type: 'AGENT_REGISTERED';
  agentId: string;
  agentType: string;
  capabilities: string;
  timestamp?: number;
}

export interface MafSupervisorDecision {
  type: 'SUPERVISOR_DECISION';
  supervisorId: string;
  executionId: string;
  decisionId: string;
  decisionType: 'escalation_approve' | 'escalation_deny' | 'task_reassign' | 'workflow_pause' | 'workflow_resume';
  targetAgentId?: string;
  context: Record<string, any>;
  reasoning: string;
  timestamp?: number;
}

export interface MafSupervisorAction {
  type: 'SUPERVISOR_ACTION';
  supervisorId: string;
  executionId: string;
  actionId: string;
  actionType: 'force_escalation' | 'intervention' | 'rollback' | 'override_lock' | 'emergency_stop';
  targetAgentId?: string;
  parameters: Record<string, any>;
  outcome: 'pending' | 'success' | 'failed';
  details?: string;
  timestamp?: number;
}

export interface MafAuditGuardRequest {
  type: 'AUDIT_GUARD_REQUEST';
  agentId: string;
  executionId: string;
  auditId: string;
  guardType: 'compliance_check' | 'security_scan' | 'quality_gate' | 'policy_validation';
  scope: {
    files?: string[];
    directories?: string[];
    rules?: string[];
    thresholds?: Record<string, number>;
  };
  context: Record<string, any>;
  timestamp?: number;
}

export interface MafAuditGuardResult {
  type: 'AUDIT_GUARD_RESULT';
  agentId: string;
  executionId: string;
  auditId: string;
  status: 'passed' | 'failed' | 'warnings' | 'blocked';
  guardType: string;
  duration: number;
  result: {
    violations: Array<{
      severity: 'low' | 'medium' | 'high' | 'critical';
      rule: string;
      description: string;
      file?: string;
      line?: number;
      suggestion?: string;
    }>;
    warnings: Array<{
      rule: string;
      description: string;
      file?: string;
      suggestion?: string;
    }>;
    metrics: Record<string, number>;
    recommendations: string[];
  };
  timestamp?: number;
}

export interface MafSmokeTestRequest {
  type: 'SMOKE_TEST_REQUEST';
  agentId: string;
  executionId: string;
  testId: string;
  testScope: 'basic' | 'comprehensive' | 'custom';
  target: {
    component?: string;
    service?: string;
    endpoint?: string;
    integration?: string;
  };
  configuration: {
    timeout?: number;
    retries?: number;
    parallel?: boolean;
    customTests?: string[];
  };
  context: Record<string, any>;
  timestamp?: number;
}

export interface MafSmokeTestResult {
  type: 'SMOKE_TEST_RESULT';
  agentId: string;
  executionId: string;
  testId: string;
  status: 'passed' | 'failed' | 'partial' | 'skipped';
  duration: number;
  testScope: string;
  results: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    testDetails: Array<{
      testName: string;
      status: 'passed' | 'failed' | 'skipped';
      duration: number;
      error?: string;
      details?: Record<string, any>;
    }>;
    performance: {
      avgResponseTime?: number;
      maxResponseTime?: number;
      throughput?: number;
      errorRate?: number;
    };
  };
  issues: Array<{
    severity: 'low' | 'medium' | 'high';
    category: 'functional' | 'performance' | 'security' | 'integration';
    description: string;
    component?: string;
    suggestion?: string;
  }>;
  timestamp?: number;
}
export type MafProtocolEnvelope = MafTaskClaim | MafWorkComplete | MafEscalationRequest | MafEscalationResponse | MafPreflightCheck | MafPreflightResult | MafPreflightExecutionStored | MafReservationCheck | MafAgentRegistered | MafSupervisorDecision | MafSupervisorAction | MafAuditGuardRequest | MafAuditGuardResult | MafSmokeTestRequest | MafSmokeTestResult;
