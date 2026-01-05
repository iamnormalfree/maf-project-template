// ABOUTME: Example usage of the extended event logger with quota and supervision events.

import { createMafEventLogger, MafEventLogger } from './event-logger';

// Example: Creating an event logger
const db = require('better-sqlite3')('./maf-events.db');
const eventLogger = createMafEventLogger(db);

// Example: Basic task lifecycle events (backward compatible)
function demonstrateBasicUsage() {
  const taskId = 'task-123';
  const agentId = 'agent-456';
  
  // Original task lifecycle events
  eventLogger.logTaskClaimed(taskId, agentId, 1);
  eventLogger.logTaskRunning(taskId);
  eventLogger.logTaskVerifying(taskId);
  eventLogger.logTaskCommitted(taskId);
  
  console.log('Basic task events logged');
}

// Example: Quota monitoring events
function demonstrateQuotaEvents() {
  // Log quota warning when approaching limits
  eventLogger.logQuotaWarning({
    quota_type: 'token',
    current_usage: 8500,
    limit: 10000,
    threshold_percent: 85,
    policy_label: 'standard-agent-policy',
    task_id: 'task-123'
  });
  
  // Log quota exceeded when limits are passed
  eventLogger.logQuotaExceeded({
    quota_type: 'cost',
    current_usage: 550,
    limit: 500,
    window_start: Date.now() - 3600000, // 1 hour ago
    window_end: Date.now(),
    policy_label: 'premium-agent-policy',
    task_id: 'task-123',
    agent_id: 'agent-456'
  });
  
  console.log('Quota events logged');
}

// Example: Agent lifecycle events
function demonstrateAgentEvents() {
  const agentId = 'agent-456';
  const taskId = 'task-123';
  
  // Agent started
  eventLogger.logAgentStarted({
    agent_id: agentId,
    agent_type: 'task-processor',
    version: '1.2.3',
    capabilities: ['processing', 'validation', 'error-handling'],
    config: { timeout: 30000, retries: 3 },
    parent_task_id: taskId
  });
  
  // Agent health check
  eventLogger.logAgentHealthCheck({
    agent_id: agentId,
    status: 'healthy',
    checks: [
      { name: 'memory', status: 'pass', value: 256, threshold: 512 },
      { name: 'cpu', status: 'warn', value: 85, threshold: 80 },
      { name: 'connectivity', status: 'pass', message: 'All systems operational' }
    ],
    resource_usage: {
      cpu_percent: 75,
      memory_mb: 256,
      active_tasks: 3,
      queue_depth: 1
    }
  });
  
  // Agent stopped
  eventLogger.logAgentStopped({
    agent_id: agentId,
    reason: 'completion',
    duration_ms: 45000,
    tasks_completed: 15,
    final_state: 'success'
  });
  
  console.log('Agent lifecycle events logged');
}

// Example: Performance monitoring events
function demonstratePerformanceEvents() {
  // Performance threshold exceeded
  eventLogger.logPerformanceThreshold({
    threshold_type: 'latency',
    metric_name: 'task_completion_time',
    current_value: 5000,
    threshold_value: 3000,
    direction: 'above',
    severity: 'warning',
    task_id: 'slow-task-789',
    window_minutes: 5
  });
  
  // Backpressure detected
  eventLogger.logBackpressureDetected({
    source: 'queue',
    current_depth: 950,
    max_capacity: 1000,
    pressure_percent: 95,
    affected_components: ['task-processor', 'validator'],
    mitigation_active: true,
    mitigation_strategy: 'scale-up',
    recovery_actions: ['add-workers', 'increase-memory']
  });
  
  console.log('Performance events logged');
}

// Example: Querying and displaying events
function demonstrateEventQueries() {
  // Get recent events
  const recentEvents = eventLogger.getAllEvents(20);
  console.log('Recent events:', recentEvents.length);
  
  // Get all quota events
  const quotaEvents = eventLogger.getEventsByKind('QUOTA_WARNING', 10);
  console.log('Recent quota warnings:', quotaEvents.length);
  
  // Get events from the last hour
  const oneHourAgo = Date.now() - 3600000;
  const recentHourEvents = eventLogger.getEventsByTimeRange(oneHourAgo, Date.now());
  console.log('Events from last hour:', recentHourEvents.length);
  
  // Format events for CLI display
  const formattedEvents = eventLogger.formatEventsForCli(recentEvents.slice(0, 5));
  formattedEvents.forEach(event => {
    const severity = event.severity ? event.severity.toUpperCase() : 'INFO';
    console.log();
    if (event.details) {
      console.log();
    }
  });
}

// Example: Complete workflow
function demonstrateCompleteWorkflow() {
  const taskId = 'workflow-task-001';
  const agentId = 'workflow-agent-001';
  
  try {
    // 1. Task claimed
    eventLogger.logTaskClaimed(taskId, agentId, 1);
    
    // 2. Agent started for this task
    eventLogger.logAgentStarted({
      agent_id: agentId,
      agent_type: 'workflow-processor',
      parent_task_id: taskId
    });
    
    // 3. Task running
    eventLogger.logTaskRunning(taskId);
    
    // 4. Monitor quota during execution
    eventLogger.logQuotaWarning({
      quota_type: 'token',
      current_usage: 7500,
      limit: 10000,
      threshold_percent: 75,
      task_id: taskId
    });
    
    // 5. Performance check
    eventLogger.logPerformanceThreshold({
      threshold_type: 'latency',
      metric_name: 'processing_time',
      current_value: 2500,
      threshold_value: 3000,
      direction: 'below',
      severity: 'info',
      task_id: taskId
    });
    
    // 6. Task verification
    eventLogger.logTaskVerifying(taskId);
    
    // 7. Task completed
    eventLogger.logTaskCommitted(taskId);
    
    // 8. Agent stopped
    eventLogger.logAgentStopped({
      agent_id: agentId,
      reason: 'completion',
      duration_ms: 30000,
      tasks_completed: 1
    });
    
    console.log('Complete workflow demonstrated');
    
  } catch (error) {
    // Log error if anything goes wrong
    eventLogger.logTaskError(taskId, error as Error, { workflow_step: 'processing' });
  }
}

// Run demonstrations
console.log('=== Extended Event Logger Demo ===');
demonstrateBasicUsage();
demonstrateQuotaEvents();
demonstrateAgentEvents();
demonstratePerformanceEvents();
demonstrateEventQueries();
demonstrateCompleteWorkflow();

console.log("\n=== Event Query Results ===");
demonstrateEventQueries();

// Close database connection
db.close();
