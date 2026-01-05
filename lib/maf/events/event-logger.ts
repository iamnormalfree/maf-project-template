// ABOUTME: Provides SQLite-first event logging with typed events for MAF task lifecycle tracking.
// ABOUTME: Implements CLAIMED, RUNNING, VERIFYING, COMMITTED, ERROR, QUOTA_EXCEEDED, QUOTA_WARNING, 
// ABOUTME: AGENT_STARTED, AGENT_STOPPED, AGENT_HEALTH_CHECK, PERFORMANCE_THRESHOLD, BACKPRESSURE_DETECTED,
// ABOUTME: SUPERVISOR_DECISION, SUPERVISOR_ACTION, SUPERVISOR_THRESHOLD_BREACH, SUPERVISOR_AGENT_INTERVENTION event types.
// ABOUTME: HEARTBEAT_RENEW_FAILURE, HEARTBEAT_MISSED, LEASE_EXPIRED event types.

// Note: better-sqlite3 types omitted to avoid build-time dependency issues

export interface MafTaskEvent {
  id: number;
  task_id: string;
  ts: number;
  kind: MafEventKind;
  data_json: string;
}

// Original event types (preserved for backward compatibility)
export type OriginalMafEventKind = "CLAIMED" | "RUNNING" | "VERIFYING" | "COMMITTED" | "ERROR";

// New extended event types for quota and supervision
export type ExtendedMafEventKind = 
  | "QUOTA_EXCEEDED"
  | "QUOTA_WARNING" 
  | "AGENT_STARTED"
  | "AGENT_STOPPED"
  | "AGENT_HEALTH_CHECK"
  | "PERFORMANCE_THRESHOLD"
  | "BACKPRESSURE_DETECTED"
  | "SUPERVISOR_DECISION"
  | "SUPERVISOR_ACTION"
  | "SUPERVISOR_THRESHOLD_BREACH"
  | "SUPERVISOR_AGENT_INTERVENTION"

// Heartbeat observability event types
export type HeartbeatMafEventKind =
  | "HEARTBEAT_RENEW_FAILURE"
  | "HEARTBEAT_MISSED"
  | "LEASE_EXPIRED";

// Backpressure observability event types
export type BackpressureMafEventKind =
  | "RATE_LIMITED"
  | "TASK_THROTTLED"
  | "TASK_QUEUED"
  | "TASK_DEFERRED"
  | "TASK_DROPPED";

// Security event types
export type SecurityMafEventKind =
  | "SECURITY_VIOLATION"
  | "SECURITY_BOUNDARY_VERIFICATION"
  | "SECURITY_EFFECTIVENESS_UPDATED"
  | "SECURITY_POLICY_UPDATED";

// Unified event type that includes all types
export type MafEventKind = OriginalMafEventKind | ExtendedMafEventKind | HeartbeatMafEventKind | BackpressureMafEventKind | SecurityMafEventKind;

// Original event data interfaces (preserved for backward compatibility)
export interface MafEventClaimedData {
  agent_id: string;
  attempt: number;
}

export interface MafEventErrorData {
  error: {
    message: string;
    name: string;
    stack?: string;
  };
  context?: Record<string, any>;
}

// Extended event data interfaces
export interface MafEventQuotaExceededData {
  quota_type: "token" | "cost" | "time" | "rate_limit";
  current_usage: number;
  limit: number;
  window_start?: number;
  window_end?: number;
  policy_label?: string;
  task_id?: string;
  agent_id?: string;
}

export interface MafEventQuotaWarningData {
  quota_type: "token" | "cost" | "time" | "rate_limit";
  current_usage: number;
  limit: number;
  threshold_percent: number;
  window_start?: number;
  window_end?: number;
  policy_label?: string;
  task_id?: string;
  agent_id?: string;
}

export interface MafEventAgentStartedData {
  agent_id: string;
  agent_type: string;
  version?: string;
  capabilities?: string[];
  config?: Record<string, any>;
  parent_task_id?: string;
}

export interface MafEventAgentStoppedData {
  agent_id: string;
  reason: "completion" | "error" | "timeout" | "cancellation" | "quota_exceeded";
  duration_ms: number;
  tasks_completed?: number;
  final_state?: string;
  error?: {
    message: string;
    name: string;
    stack?: string;
  };
}

export interface MafEventAgentHealthCheckData {
  agent_id: string;
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    name: string;
    status: "pass" | "fail" | "warn";
    message?: string;
    value?: any;
    threshold?: any;
  }[];
  resource_usage?: {
    cpu_percent?: number;
    memory_mb?: number;
    active_tasks?: number;
    queue_depth?: number;
  };
}

// Heartbeat observability event data interfaces
export interface MafEventHeartbeatRenewFailureData {
  agent_id: string;
  task_id?: string;
  failure_reason: "database_error" | "network_timeout" | "lease_not_found" | "permission_denied" | "unknown";
  error_details?: {
    message: string;
    code?: string;
    stack?: string;
  };
  renewal_attempt_count: number;
  lease_expires_at?: number;
  time_to_expiry_ms?: number;
  retry_scheduled: boolean;
  next_retry_at?: number;
}

export interface MafEventHeartbeatMissedData {
  agent_id: string;
  task_id?: string;
  missed_count: number;
  consecutive_misses: number;
  expected_interval_ms: number;
  last_successful_heartbeat?: number;
  time_since_last_heartbeat_ms?: number;
  grace_period_remaining_ms?: number;
  health_status: "degraded" | "critical" | "unknown";
  automatic_recovery_triggered: boolean;
}

export interface MafEventLeaseExpiredData {
  agent_id: string;
  task_id: string;
  lease_expires_at: number;
  expiration_detected_at: number;
  time_since_expiry_ms: number;
  task_state: "LEASED" | "RUNNING" | "VERIFYING" | "unknown";
  renewal_attempts_made: number;
  last_renewal_attempt?: number;
  task_reclaimed: boolean;
  reclamation_action: "ready_for_retry" | "requires_manual_intervention" | "auto_recovered";
}

export interface MafEventPerformanceThresholdData {
  threshold_type: "latency" | "throughput" | "error_rate" | "queue_depth" | "resource_usage";
  metric_name: string;
  current_value: number;
  threshold_value: number;
  direction: "above" | "below";
  severity: "info" | "warning" | "critical";
  task_id?: string;
  agent_id?: string;
  window_minutes?: number;
}

export interface MafEventBackpressureDetectedData {
  source: "queue" | "database" | "external_api" | "resource_limit";
  current_depth: number;
  max_capacity: number;
  pressure_percent: number;
  affected_components?: string[];
  mitigation_active?: boolean;
  mitigation_strategy?: string;
  recovery_actions?: string[];
}

// Backpressure decision event data interfaces
export interface MafEventRateLimitedData {
  provider_id: string;
  current_tokens: number;
  capacity: number;
  refill_rate: number;
  wait_time_ms: number;
  next_refill_time: number;
  task_id?: string;
}

export interface MafEventTaskThrottledData {
  provider_id: string;
  reason: "rate_limit" | "quota_exceeded" | "system_overloaded";
  wait_time_ms?: number;
  retry_after_ms?: number;
  task_id: string;
  original_priority: "high" | "medium" | "low";
}

export interface MafEventTaskQueuedData {
  provider_id: string;
  task_id: string;
  priority: "high" | "medium" | "low";
  queue_position: number;
  estimated_wait_time_ms: number;
  queue_depth: number;
  queue_capacity: number;
}

export interface MafEventTaskDeferredData {
  provider_id: string;
  task_id: string;
  original_priority: "high" | "medium" | "low";
  new_priority: "high" | "medium" | "low";
  reason: "queue_full" | "resource_limit";
  queue_depths: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface MafEventTaskDroppedData {
  provider_id: string;
  task_id: string;
  reason: "rate_limit" | "quota_exceeded" | "queue_full" | "system_overloaded";
  original_priority: "high" | "medium" | "low";
  retry_available: boolean;
  drop_reason_details?: string;
}

// Supervisor-specific event data interfaces
export interface MafEventSupervisorDecisionData {
  supervisor_id: string;
  decision_type: "agent_scaling" | "resource_allocation" | "prioritization" | "isolation" | "recovery";
  trigger_condition: string;
  context: {
    affected_agents?: string[];
    affected_tasks?: string[];
    metrics?: Record<string, number>;
    policy_name?: string;
    severity?: "low" | "medium" | "high" | "critical";
  };
  decision: {
    action: string;
    rationale: string;
    expected_impact?: string;
    confidence?: number;
  };
  task_id?: string;
  agent_id?: string;
}

export interface MafEventSupervisorActionData {
  supervisor_id: string;
  action_type: "start_agent" | "stop_agent" | "restart_agent" | "adjust_quota" | "redirect_task" | "isolate_component";
  target_type: "agent" | "task" | "resource" | "system";
  target_id: string;
  action_details: {
    description: string;
    parameters?: Record<string, any>;
    previous_state?: any;
    new_state?: any;
  };
  outcome: {
    status: "initiated" | "completed" | "failed" | "timeout";
    result?: any;
    error?: string;
  };
  execution_time_ms?: number;
  task_id?: string;
  agent_id?: string;
}

export interface MafEventSupervisorThresholdBreachData {
  supervisor_id: string;
  threshold_name: string;
  metric_path: string;
  current_value: number;
  threshold_value: number;
  direction: "above" | "below";
  severity: "info" | "warning" | "critical";
  evaluation_window_seconds?: number;
  breach_duration_seconds?: number;
  affected_systems?: string[];
  automatic_response_triggered?: boolean;
  response_actions?: string[];
  task_id?: string;
  agent_id?: string;
}

export interface MafEventSupervisorAgentInterventionData {
  supervisor_id: string;
  agent_id: string;
  intervention_type: "restart" | "quarantine" | "resource_boost" | "priority_change" | "configuration_update";
  reason: {
    primary_cause: string;
    contributing_factors?: string[];
    health_status?: "healthy" | "degraded" | "unhealthy" | "critical";
    performance_impact?: "none" | "low" | "medium" | "high" | "critical";
  };
  intervention_details: {
    action_taken: string;
    pre_intervention_state?: any;
    post_intervention_state?: any;
    parameters?: Record<string, any>;
  };
  outcome: {
    status: "success" | "partial" | "failed";
    recovery_time_ms?: number;
    stabilization_achieved?: boolean;
    follow_up_required?: boolean;
  };
  automated: boolean;
  manual_override_available?: boolean;
  task_id?: string;
}

// Security event data interfaces
export interface MafEventSecurityViolationData {
  violation_type: "network_access" | "filesystem_access" | "process_execution" | "privilege_escalation" | "policy_breach";
  severity: "low" | "medium" | "high" | "critical";
  command?: string;
  args?: string[];
  blocked_resource?: string;
  action_taken: "blocked" | "allowed" | "logged" | "modified";
  security_profile: {
    name: string;
    enforcement_mode: "strict" | "monitoring_only";
    allowed_hosts?: string[];
    allowed_ports?: number[];
  };
  timestamp: number;
  task_id?: string;
  worker_id?: string;
  threat_context?: {
    ip_address?: string;
    domain?: string;
    file_path?: string;
    process_name?: string;
  };
}

export interface MafEventSecurityBoundaryVerificationData {
  boundary_type: "network" | "filesystem" | "process" | "resource";
  verification_method: "automated_test" | "manual_audit" | "real_world_attempt";
  effectiveness_score: number; // 0-100
  tests_run: number;
  tests_passed: number;
  threats_blocked: string[];
  threats_missed?: string[];
  security_profile: {
    name: string;
    configuration: Record<string, any>;
  };
  verification_timestamp: number;
  task_id?: string;
  worker_id?: string;
  recommendations?: string[];
}

export interface MafEventSecurityEffectivenessUpdatedData {
  previous_score: number;
  current_score: number;
  boundary_type: "network" | "filesystem" | "process" | "resource" | "overall";
  change_type: "improvement" | "degradation" | "initial_baseline";
  improvement_reason?: string;
  degradation_cause?: string;
  configuration_changes?: Record<string, any>;
  new_threats_addressed?: string[];
  security_profile: {
    name: string;
    version?: string;
  };
  measurement_timestamp: number;
  task_id?: string;
  worker_id?: string;
}

export interface MafEventSecurityPolicyUpdatedData {
  policy_type: "network" | "filesystem" | "process" | "resource" | "global";
  update_type: "created" | "modified" | "deleted";
  policy_name: string;
  previous_policy?: Record<string, any>;
  new_policy: Record<string, any>;
  change_reason: string;
  changed_by: "system" | "administrator" | "automated_response";
  impact_assessment: {
    affected_tasks?: string[];
    security_impact: "increased" | "decreased" | "neutral";
    compatibility_issues?: string[];
  };
  update_timestamp: number;
  task_id?: string;
  worker_id?: string;
}

// Unified event data type that includes all event data types
export type MafEventData =
  | MafEventClaimedData
  | MafEventErrorData
  | MafEventQuotaExceededData
  | MafEventQuotaWarningData
  | MafEventAgentStartedData
  | MafEventAgentStoppedData
  | MafEventAgentHealthCheckData
  | MafEventHeartbeatRenewFailureData
  | MafEventHeartbeatMissedData
  | MafEventLeaseExpiredData
  | MafEventPerformanceThresholdData
  | MafEventBackpressureDetectedData
  | MafEventRateLimitedData
  | MafEventTaskThrottledData
  | MafEventTaskQueuedData
  | MafEventTaskDeferredData
  | MafEventTaskDroppedData
  | MafEventSupervisorDecisionData
  | MafEventSupervisorActionData
  | MafEventSupervisorThresholdBreachData
  | MafEventSupervisorAgentInterventionData
  | MafEventSecurityViolationData
  | MafEventSecurityBoundaryVerificationData
  | MafEventSecurityEffectivenessUpdatedData
  | MafEventSecurityPolicyUpdatedData
  | Record<string, never>; // For RUNNING, VERIFYING, COMMITTED with empty data

// Type guards to check event data types
export function isQuotaExceededData(data: any): data is MafEventQuotaExceededData {
  return data !== null && data !== undefined && typeof data.quota_type === "string" && typeof data.current_usage === "number" && typeof data.limit === "number";
}

export function isQuotaWarningData(data: any): data is MafEventQuotaWarningData {
  return data !== null && data !== undefined && typeof data.quota_type === "string" && typeof data.current_usage === "number" && typeof data.limit === "number" && typeof data.threshold_percent === "number";
}

export function isAgentStartedData(data: any): data is MafEventAgentStartedData {
  return data && typeof data.agent_id === "string" && typeof data.agent_type === "string";
}

export function isAgentStoppedData(data: any): data is MafEventAgentStoppedData {
  return data && typeof data.agent_id === "string" && typeof data.reason === "string" && typeof data.duration_ms === "number";
}

export function isAgentHealthCheckData(data: any): data is MafEventAgentHealthCheckData {
  return data && typeof data.agent_id === "string" && typeof data.status === "string" && Array.isArray(data.checks);
}

// Heartbeat event type guards
export function isHeartbeatRenewFailureData(data: any): data is MafEventHeartbeatRenewFailureData {
  return data && typeof data.agent_id === "string" && typeof data.failure_reason === "string" && typeof data.renewal_attempt_count === "number";
}

export function isHeartbeatMissedData(data: any): data is MafEventHeartbeatMissedData {
  return data && typeof data.agent_id === "string" && typeof data.missed_count === "number" && typeof data.consecutive_misses === "number" && typeof data.health_status === "string";
}

export function isLeaseExpiredData(data: any): data is MafEventLeaseExpiredData {
  return data && typeof data.agent_id === "string" && typeof data.task_id === "string" && typeof data.lease_expires_at === "number" && typeof data.expiration_detected_at === "number";
}

export function isPerformanceThresholdData(data: any): data is MafEventPerformanceThresholdData {
  return data && typeof data.threshold_type === "string" && typeof data.metric_name === "string" && typeof data.current_value === "number" && typeof data.threshold_value === "number";
}

export function isBackpressureDetectedData(data: any): data is MafEventBackpressureDetectedData {
  return data && typeof data.source === "string" && typeof data.current_depth === "number" && typeof data.max_capacity === "number" && typeof data.pressure_percent === "number";
}

export function isRateLimitedData(data: any): data is MafEventRateLimitedData {
  return data && typeof data.provider_id === "string" && typeof data.current_tokens === "number" && typeof data.capacity === "number" && typeof data.refill_rate === "number" && typeof data.wait_time_ms === "number";
}

export function isTaskThrottledData(data: any): data is MafEventTaskThrottledData {
  return data && typeof data.provider_id === "string" && typeof data.reason === "string" && typeof data.task_id === "string" && typeof data.original_priority === "string";
}

export function isTaskQueuedData(data: any): data is MafEventTaskQueuedData {
  return data && typeof data.provider_id === "string" && typeof data.task_id === "string" && typeof data.priority === "string" && typeof data.queue_position === "number" && typeof data.estimated_wait_time_ms === "number";
}

export function isTaskDeferredData(data: any): data is MafEventTaskDeferredData {
  return data && typeof data.provider_id === "string" && typeof data.task_id === "string" && typeof data.original_priority === "string" && typeof data.new_priority === "string" && typeof data.reason === "string";
}

export function isTaskDroppedData(data: any): data is MafEventTaskDroppedData {
  return data && typeof data.provider_id === "string" && typeof data.task_id === "string" && typeof data.reason === "string" && typeof data.original_priority === "string" && typeof data.retry_available === "boolean";
}

// Supervisor event type guards
export function isSupervisorDecisionData(data: any): data is MafEventSupervisorDecisionData {
  return data && typeof data.supervisor_id === "string" && typeof data.decision_type === "string" && typeof data.trigger_condition === "string" && data.context && data.decision && typeof data.decision.action === "string";
}

export function isSupervisorActionData(data: any): data is MafEventSupervisorActionData {
  return data && typeof data.supervisor_id === "string" && typeof data.action_type === "string" && typeof data.target_type === "string" && typeof data.target_id === "string" && data.action_details && data.outcome;
}

export function isSupervisorThresholdBreachData(data: any): data is MafEventSupervisorThresholdBreachData {
  return data && typeof data.supervisor_id === "string" && typeof data.threshold_name === "string" && typeof data.metric_path === "string" && typeof data.current_value === "number" && typeof data.threshold_value === "number";
}

export function isSupervisorAgentInterventionData(data: any): data is MafEventSupervisorAgentInterventionData {
  return data && typeof data.supervisor_id === "string" && typeof data.agent_id === "string" && typeof data.intervention_type === "string" && data.reason && data.intervention_details && data.outcome;
}

// Event formatting helpers for CLI display
export interface MafEventDisplayFormat {
  kind: string;
  timestamp: string;
  summary: string;
  details?: string;
  severity?: "info" | "warning" | "error" | "critical";
}

export function formatEventForDisplay(event: MafTaskEvent): MafEventDisplayFormat {
  const timestamp = new Date(event.ts).toISOString();
  let summary = "";
  let details = "";
  let severity: "info" | "warning" | "error" | "critical" = "info";

  try {
    const data = JSON.parse(event.data_json);
    
    switch (event.kind) {
      case "CLAIMED":
        summary = "Task claimed by agent " + data.agent_id + " (attempt " + data.attempt + ")";
        severity = "info";
        break;
        
      case "RUNNING":
        summary = "Task started execution";
        severity = "info";
        break;
        
      case "VERIFYING":
        summary = "Task verification started";
        severity = "info";
        break;
        
      case "COMMITTED":
        summary = "Task completed successfully";
        severity = "info";
        break;
        
      case "ERROR":
        const errorMsg = data.error && data.error.message ? data.error.message : "Unknown error";
        summary = "Task failed: " + errorMsg;
        if (data.error && (data.error.stack || data.context)) {
          details = JSON.stringify({ stack: data.error.stack, context: data.context }, null, 2);
        }
        severity = "error";
        break;
        
      case "QUOTA_EXCEEDED":
        summary = data.quota_type.toUpperCase() + " quota exceeded: " + data.current_usage + "/" + data.limit;
        details = data.policy_label ? "Policy: " + data.policy_label : "";
        severity = "error";
        break;
        
      case "QUOTA_WARNING":
        summary = data.quota_type.toUpperCase() + " quota warning: " + data.current_usage + "/" + data.limit + " (" + data.threshold_percent + "%)";
        details = data.policy_label ? "Policy: " + data.policy_label : "";
        severity = "warning";
        break;
        
      case "AGENT_STARTED":
        summary = "Agent " + data.agent_id + " (" + data.agent_type + ") started";
        details = data.capabilities ? "Capabilities: " + data.capabilities.join(", ") : "";
        severity = "info";
        break;
        
      case "AGENT_STOPPED":
        summary = "Agent " + data.agent_id + " stopped: " + data.reason;
        details = "Duration: " + data.duration_ms + "ms, Tasks: " + (data.tasks_completed || 0);
        severity = data.reason === "error" ? "error" : "info";
        break;
        
      case "AGENT_HEALTH_CHECK":
        summary = "Agent " + data.agent_id + " health: " + data.status;
        if (data.checks) {
          details = data.checks.map((check: any) => check.name + ": " + check.status).join(", ");
        }
        severity = data.status === "unhealthy" ? "error" : data.status === "degraded" ? "warning" : "info";
        break;
        
      case "PERFORMANCE_THRESHOLD":
        summary = data.threshold_type + " threshold: " + data.metric_name + " " + data.direction + " threshold (" + data.current_value + "/" + data.threshold_value + ")";
        severity = data.severity || "warning";
        break;
        
      case "BACKPRESSURE_DETECTED":
        summary = "Backpressure in " + data.source + ": " + data.pressure_percent + "% capacity used";
        details = "Queue depth: " + data.current_depth + "/" + data.max_capacity;
        severity = data.pressure_percent > 90 ? "critical" : data.pressure_percent > 75 ? "error" : "warning";
        break;

      case "RATE_LIMITED":
        summary = "Provider " + data.provider_id + " rate limited: " + data.current_tokens + "/" + data.capacity + " tokens";
        details = "Wait time: " + data.wait_time_ms + "ms | Refill rate: " + data.refill_rate + "/s";
        severity = "warning";
        break;

      case "TASK_THROTTLED":
        summary = "Task " + data.task_id + " throttled by " + data.provider_id + ": " + data.reason;
        details = "Priority: " + data.original_priority + (data.wait_time_ms ? " | Retry after: " + data.wait_time_ms + "ms" : '');
        severity = "warning";
        break;

      case "TASK_QUEUED":
        summary = "Task " + data.task_id + " queued for " + data.provider_id + " (" + data.priority + " priority)";
        details = "Position: " + data.queue_position + " | Wait time: " + data.estimated_wait_time_ms + "ms";
        severity = "info";
        break;

      case "TASK_DEFERRED":
        summary = "Task " + data.task_id + " deferred from " + data.original_priority + " to " + data.new_priority + " priority";
        details = "Provider: " + data.provider_id + " | Reason: " + data.reason;
        severity = "warning";
        break;

      case "TASK_DROPPED":
        summary = "Task " + data.task_id + " dropped by " + data.provider_id + ": " + data.reason;
        details = "Priority: " + data.original_priority + (data.retry_available ? " | Retry available" : " | No retry available");
        severity = "error";
        break;
        
      case "SUPERVISOR_DECISION":
        summary = "Supervisor " + data.supervisor_id + " decision: " + data.decision_type + " - " + data.decision.action;
        details = "Trigger: " + data.trigger_condition + " | Confidence: " + (data.decision.confidence || 'N/A');
        severity = data.context?.severity === "critical" ? "critical" : data.context?.severity === "high" ? "error" : "info";
        break;
        
      case "SUPERVISOR_ACTION":
        summary = "Supervisor " + data.supervisor_id + " action: " + data.action_type + " on " + data.target_type + " " + data.target_id;
        details = "Status: " + data.outcome.status + (data.execution_time_ms ? " | Time: " + data.execution_time_ms + "ms" : '');
        severity = data.outcome.status === "failed" ? "error" : data.outcome.status === "timeout" ? "warning" : "info";
        break;
        
      case "SUPERVISOR_THRESHOLD_BREACH":
        summary = "Supervisor " + data.supervisor_id + ": " + data.threshold_name + " breach (" + data.metric_path + ")";
        details = data.direction + " threshold: " + data.current_value + "/" + data.threshold_value;
        severity = data.severity || "warning";
        break;
        
      case "SUPERVISOR_AGENT_INTERVENTION":
        summary = "Supervisor " + data.supervisor_id + " intervention on agent " + data.agent_id + ": " + data.intervention_type;
        details = "Reason: " + data.reason.primary_cause + " | Status: " + data.outcome.status + (data.outcome.recovery_time_ms ? " | Recovery: " + data.outcome.recovery_time_ms + "ms" : '');
        severity = data.outcome.status === "failed" ? "error" : data.reason.health_status === "critical" ? "critical" : "info";
        break;

      case "HEARTBEAT_RENEW_FAILURE":
        summary = "Agent " + data.agent_id + " lease renewal failed: " + data.failure_reason;
        details = "Attempt " + data.renewal_attempt_count + (data.time_to_expiry_ms ? " | Time to expiry: " + data.time_to_expiry_ms + "ms" : "") + (data.retry_scheduled ? " | Retry scheduled" : " | No retry");
        severity = data.time_to_expiry_ms && data.time_to_expiry_ms < 5000 ? "critical" : "error";
        break;

      case "HEARTBEAT_MISSED":
        summary = "Agent " + data.agent_id + " missed " + data.consecutive_misses + " consecutive heartbeats";
        details = "Missed: " + data.missed_count + " | Interval: " + data.expected_interval_ms + "ms | Status: " + data.health_status;
        severity = data.health_status === "critical" ? "critical" : data.health_status === "degraded" ? "error" : "warning";
        break;

      case "LEASE_EXPIRED":
        summary = "Lease expired for agent " + data.agent_id + " on task " + data.task_id;
        details = "Expired " + data.time_since_expiry_ms + "ms ago | State: " + data.task_state + " | Renewal attempts: " + data.renewal_attempts_made;
        severity = data.task_state === "RUNNING" ? "critical" : "error";
        break;

      default:
        summary = "Unknown event kind: " + event.kind;
        severity = "warning";
    }
  } catch (error) {
    summary = "Invalid event data for " + event.kind;
    severity = "error";
  }

  return {
    kind: event.kind,
    timestamp,
    summary,
    details,
    severity
  };
}

// Extended MafEventLogger interface with new methods
export interface MafEventLogger {
  // Original methods (preserved for backward compatibility)
  logTaskClaimed(taskId: string, agentId: string, attempt: number): void;
  logTaskRunning(taskId: string): void;
  logTaskVerifying(taskId: string): void;
  logTaskCommitted(taskId: string): void;
  logTaskError(taskId: string, error: Error, context?: Record<string, any>): void;
  getTaskEvents(taskId: string): MafTaskEvent[];
  
  // New extended methods
  logQuotaExceeded(data: MafEventQuotaExceededData): void;
  logQuotaWarning(data: MafEventQuotaWarningData): void;
  logAgentStarted(data: MafEventAgentStartedData): void;
  logAgentStopped(data: MafEventAgentStoppedData): void;
  logAgentHealthCheck(data: MafEventAgentHealthCheckData): void;

  // Heartbeat observability methods
  logHeartbeatRenewFailure(data: MafEventHeartbeatRenewFailureData): void;
  logHeartbeatMissed(data: MafEventHeartbeatMissedData): void;
  logLeaseExpired(data: MafEventLeaseExpiredData): void;

  logPerformanceThreshold(data: MafEventPerformanceThresholdData): void;
  logBackpressureDetected(data: MafEventBackpressureDetectedData): void;

  // Backpressure observability methods
  logRateLimited(data: MafEventRateLimitedData): void;
  logTaskThrottled(data: MafEventTaskThrottledData): void;
  logTaskQueued(data: MafEventTaskQueuedData): void;
  logTaskDeferred(data: MafEventTaskDeferredData): void;
  logTaskDropped(data: MafEventTaskDroppedData): void;

  // Supervisor-specific methods
  logSupervisorDecision(data: MafEventSupervisorDecisionData): void;
  logSupervisorAction(data: MafEventSupervisorActionData): void;
  logSupervisorThresholdBreach(data: MafEventSupervisorThresholdBreachData): void;
  logSupervisorAgentIntervention(data: MafEventSupervisorAgentInterventionData): void;

  // Security event methods
  logSecurityViolation(data: MafEventSecurityViolationData): void;
  logSecurityBoundaryVerification(data: MafEventSecurityBoundaryVerificationData): void;
  logSecurityEffectivenessUpdated(data: MafEventSecurityEffectivenessUpdatedData): void;
  logSecurityPolicyUpdated(data: MafEventSecurityPolicyUpdatedData): void;

  // Utility methods
  getAllEvents(limit?: number): MafTaskEvent[];
  getEventsByKind(kind: MafEventKind, limit?: number): MafTaskEvent[];
  getEventsByTimeRange(startTime: number, endTime: number): MafTaskEvent[];
  formatEventsForCli(events: MafTaskEvent[]): MafEventDisplayFormat[];
}

export function createMafEventLogger(db: any): MafEventLogger {
  const insertEventStmt = db.prepare(`
    INSERT INTO events(task_id, ts, kind, data_json) 
    VALUES(?, ?, ?, ?)
  `);

  const getEventsStmt = db.prepare(`
    SELECT * FROM events 
    WHERE task_id = ? 
    ORDER BY ts ASC
  `);

  const getAllEventsStmt = db.prepare(`
    SELECT * FROM events 
    ORDER BY ts DESC 
    LIMIT ?
  `);

  const getEventsByKindStmt = db.prepare(`
    SELECT * FROM events 
    WHERE kind = ? 
    ORDER BY ts DESC 
    LIMIT ?
  `);

  const getEventsByTimeRangeStmt = db.prepare(`
    SELECT * FROM events 
    WHERE ts >= ? AND ts <= ? 
    ORDER BY ts ASC
  `);

  // Helper function to insert events with error handling
  function insertEvent(taskId: string, kind: MafEventKind, data: any): void {
    try {
      const ts = Date.now();
      const dataJson = JSON.stringify(data);
      
      insertEventStmt.run(taskId, ts, kind, dataJson);
    } catch (error) {
      // Log error but don't throw to avoid breaking the main application
      console.error("Failed to insert event " + kind + " for task " + taskId + ":", error);
    }
  }

  return {
    // Original methods (preserved for backward compatibility)
    logTaskClaimed(taskId: string, agentId: string, attempt: number): void {
      const data: MafEventClaimedData = { agent_id: agentId, attempt };
      insertEvent(taskId, "CLAIMED", data);
    },

    logTaskRunning(taskId: string): void {
      insertEvent(taskId, "RUNNING", {});
    },

    logTaskVerifying(taskId: string): void {
      insertEvent(taskId, "VERIFYING", {});
    },

    logTaskCommitted(taskId: string): void {
      insertEvent(taskId, "COMMITTED", {});
    },

    logTaskError(taskId: string, error: Error, context?: Record<string, any>): void {
      const data: MafEventErrorData = {
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack
        },
        context
      };
      insertEvent(taskId, "ERROR", data);
    },

    getTaskEvents(taskId: string): MafTaskEvent[] {
      try {
        return getEventsStmt.all(taskId) as MafTaskEvent[];
      } catch (error) {
        console.error("Failed to get events for task " + taskId + ":", error);
        return [];
      }
    },

    // New extended methods
    logQuotaExceeded(data: MafEventQuotaExceededData): void {
      // Use a special task_id for system events
      const taskId = data.task_id || "system:quota-monitor";
      insertEvent(taskId, "QUOTA_EXCEEDED", data);
    },

    logQuotaWarning(data: MafEventQuotaWarningData): void {
      const taskId = data.task_id || "system:quota-monitor";
      insertEvent(taskId, "QUOTA_WARNING", data);
    },

    logAgentStarted(data: MafEventAgentStartedData): void {
      const taskId = data.parent_task_id || "system:agent-supervisor";
      insertEvent(taskId, "AGENT_STARTED", data);
    },

    logAgentStopped(data: MafEventAgentStoppedData): void {
      insertEvent("system:agent-supervisor", "AGENT_STOPPED", data);
    },

    logAgentHealthCheck(data: MafEventAgentHealthCheckData): void {
      insertEvent("system:agent-supervisor", "AGENT_HEALTH_CHECK", data);
    },

    // Heartbeat observability methods
    logHeartbeatRenewFailure(data: MafEventHeartbeatRenewFailureData): void {
      const taskId = data.task_id || "system:heartbeat-monitor";
      insertEvent(taskId, "HEARTBEAT_RENEW_FAILURE", data);
    },

    logHeartbeatMissed(data: MafEventHeartbeatMissedData): void {
      const taskId = data.task_id || "system:heartbeat-monitor";
      insertEvent(taskId, "HEARTBEAT_MISSED", data);
    },

    logLeaseExpired(data: MafEventLeaseExpiredData): void {
      insertEvent(data.task_id, "LEASE_EXPIRED", data);
    },

    logPerformanceThreshold(data: MafEventPerformanceThresholdData): void {
      const taskId = data.task_id || "system:performance-monitor";
      insertEvent(taskId, "PERFORMANCE_THRESHOLD", data);
    },

    logBackpressureDetected(data: MafEventBackpressureDetectedData): void {
      insertEvent("system:backpressure-monitor", "BACKPRESSURE_DETECTED", data);
    },

    // Backpressure observability methods
    logRateLimited(data: MafEventRateLimitedData): void {
      insertEvent(data.task_id || "system:rate-limiter", "RATE_LIMITED", data);
    },

    logTaskThrottled(data: MafEventTaskThrottledData): void {
      insertEvent(data.task_id, "TASK_THROTTLED", data);
    },

    logTaskQueued(data: MafEventTaskQueuedData): void {
      insertEvent(data.task_id, "TASK_QUEUED", data);
    },

    logTaskDeferred(data: MafEventTaskDeferredData): void {
      insertEvent(data.task_id, "TASK_DEFERRED", data);
    },

    logTaskDropped(data: MafEventTaskDroppedData): void {
      insertEvent(data.task_id, "TASK_DROPPED", data);
    },

    // Supervisor-specific methods
    logSupervisorDecision(data: MafEventSupervisorDecisionData): void {
      const taskId = data.task_id || "system:supervisor";
      insertEvent(taskId, "SUPERVISOR_DECISION", data);
    },

    logSupervisorAction(data: MafEventSupervisorActionData): void {
      const taskId = data.task_id || "system:supervisor";
      insertEvent(taskId, "SUPERVISOR_ACTION", data);
    },

    logSupervisorThresholdBreach(data: MafEventSupervisorThresholdBreachData): void {
      const taskId = data.task_id || "system:supervisor";
      insertEvent(taskId, "SUPERVISOR_THRESHOLD_BREACH", data);
    },

    logSupervisorAgentIntervention(data: MafEventSupervisorAgentInterventionData): void {
      const taskId = data.task_id || "system:supervisor";
      insertEvent(taskId, "SUPERVISOR_AGENT_INTERVENTION", data);
    },

    // Security event methods
    logSecurityViolation(data: MafEventSecurityViolationData): void {
      const taskId = data.task_id || "system:security-monitor";
      const enrichedData = {
        ...data,
        logging_timestamp: Date.now(),
        logging_performance: {
          overhead_ms: 0 // Will be measured by caller
        }
      };
      insertEvent(taskId, "SECURITY_VIOLATION", enrichedData);
    },

    logSecurityBoundaryVerification(data: MafEventSecurityBoundaryVerificationData): void {
      const taskId = data.task_id || "system:security-verifier";
      insertEvent(taskId, "SECURITY_BOUNDARY_VERIFICATION", data);
    },

    logSecurityEffectivenessUpdated(data: MafEventSecurityEffectivenessUpdatedData): void {
      const taskId = data.task_id || "system:security-monitor";
      insertEvent(taskId, "SECURITY_EFFECTIVENESS_UPDATED", data);
    },

    logSecurityPolicyUpdated(data: MafEventSecurityPolicyUpdatedData): void {
      const taskId = data.task_id || "system:security-admin";
      insertEvent(taskId, "SECURITY_POLICY_UPDATED", data);
    },

    // Utility methods
    getAllEvents(limit: number = 100): MafTaskEvent[] {
      try {
        return getAllEventsStmt.all(limit) as MafTaskEvent[];
      } catch (error) {
        console.error("Failed to get all events:", error);
        return [];
      }
    },

    getEventsByKind(kind: MafEventKind, limit: number = 50): MafTaskEvent[] {
      try {
        return getEventsByKindStmt.all(kind, limit) as MafTaskEvent[];
      } catch (error) {
        console.error("Failed to get events by kind " + kind + ":", error);
        return [];
      }
    },

    getEventsByTimeRange(startTime: number, endTime: number): MafTaskEvent[] {
      try {
        return getEventsByTimeRangeStmt.all(startTime, endTime) as MafTaskEvent[];
      } catch (error) {
        console.error("Failed to get events by time range:", error);
        return [];
      }
    },

    formatEventsForCli(events: MafTaskEvent[]): MafEventDisplayFormat[] {
      return events.map(formatEventForDisplay);
    }
  };
}
