// ABOUTME: Tasks section generator for MAF dashboard
// ABOUTME: Creates markdown section showing task status and progress

import type { TaskData, EventData } from '../collectors/sqlite-collector';

export interface TasksSectionData {
  tasks: TaskData[];
  events: EventData[];
  lastUpdated: number;
}

/**
 * Generate tasks section for dashboard
 */
export function generateTasksSection(data: TasksSectionData): string {
  const { tasks, events, lastUpdated } = data;

  const lines = [
    '## 📋 Tasks Overview',
    '',
    '*Last updated: ' + new Date(lastUpdated).toISOString() + '*',
    ''
  ];

  if (tasks.length === 0) {
    lines.push('No tasks found in the system.');
    lines.push('');
    return lines.join('\n');
  }

  // Task state summary
  const stateSummary = getStateSummary(tasks);
  
  lines.push('### Task Status Summary');
  lines.push('');
  lines.push('| Status | Count | Percentage |');
  lines.push('|--------|-------|------------|');
  
  for (const [state, count] of Object.entries(stateSummary)) {
    const percentage = ((count / tasks.length) * 100).toFixed(1);
    const emoji = getStateEmoji(state);
    lines.push('| ' + emoji + ' ' + state + ' | ' + count + ' | ' + percentage + '% |');
  }
  
  lines.push('| **Total** | **' + tasks.length + '** | **100%** |');
  lines.push('');

  // Recent activity
  const recentEvents = events
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);

  if (recentEvents.length > 0) {
    lines.push('### Recent Activity');
    lines.push('');
    
    for (const event of recentEvents) {
      const time = formatRelativeTime(event.timestamp);
      const emoji = getEventEmoji(event.kind);
      
      lines.push('- ' + emoji + ' **' + time + '**: ' + formatEventDescription(event));
    }
    lines.push('');
  }

  // Active tasks
  const activeTasks = tasks.filter(t => ['READY', 'LEASED', 'RUNNING', 'VERIFYING'].includes(t.state));
  
  if (activeTasks.length > 0) {
    lines.push('### Active Tasks');
    lines.push('');
    
    for (const task of activeTasks.slice(0, 20)) { // Limit to 20 most recent
      const stateEmoji = getStateEmoji(task.state);
      const created = formatRelativeTime(task.createdAt);
      const age = Math.floor((Date.now() - task.createdAt) / 1000 / 60); // minutes
      
      lines.push('#### ' + stateEmoji + ' ' + task.id);
      lines.push('');
      lines.push('- **State:** ' + task.state);
      lines.push('- **Priority:** ' + task.priority);
      lines.push('- **Created:** ' + created + ' (' + age + ' minutes ago)');
      lines.push('- **Attempts:** ' + task.attempts);
      
      if (task.agentId) {
        lines.push('- **Agent:** ' + task.agentId);
      }
      
      if (task.duration) {
        lines.push('- **Duration:** ' + formatDuration(task.duration));
      }
      
      lines.push('- **Policy:** ' + task.policyLabel);
      
      // Link to evidence if this task has evidence
      const hasEvidence = events.some(e => e.taskId === task.id && e.kind.includes('evidence'));
      if (hasEvidence) {
        lines.push('- **Evidence:** Available in system logs');
      }
      
      lines.push('');
    }
  }

  // Tasks with issues
  const problemTasks = tasks.filter(t => t.attempts > 3 || t.state === 'DEAD');
  
  if (problemTasks.length > 0) {
    lines.push('### 🚨 Tasks Needing Attention');
    lines.push('');
    
    for (const task of problemTasks) {
      const stateEmoji = getStateEmoji(task.state);
      lines.push('- ' + stateEmoji + ' **' + task.id + '**: ' + task.state + ' (' + task.attempts + ' attempts)');
    }
    lines.push('');
  }

  // Performance metrics
  lines.push('### Performance Metrics');
  lines.push('');
  
  const completedTasks = tasks.filter(t => t.state === 'DONE');
  const failedTasks = tasks.filter(t => t.state === 'DEAD');
  
  if (completedTasks.length > 0) {
    const avgAttempts = completedTasks.reduce((sum, t) => sum + t.attempts, 0) / completedTasks.length;
    lines.push('- **Average attempts per completed task:** ' + avgAttempts.toFixed(1));
  }
  
  if (failedTasks.length > 0) {
    const failureRate = (failedTasks.length / tasks.length * 100).toFixed(1);
    lines.push('- **Failure rate:** ' + failureRate + '%');
  }
  
  const highPriorityTasks = tasks.filter(t => t.priority >= 90);
  if (highPriorityTasks.length > 0) {
    lines.push('- **High priority tasks (90+):** ' + highPriorityTasks.length);
  }
  
  lines.push('');

  return lines.join('\n');
}

/**
 * Get task state summary
 */
function getStateSummary(tasks: TaskData[]): Record<string, number> {
  const summary: Record<string, number> = {};
  
  for (const task of tasks) {
    summary[task.state] = (summary[task.state] || 0) + 1;
  }
  
  return summary;
}

/**
 * Get state emoji for task
 */
function getStateEmoji(state: string): string {
  switch (state) {
    case 'READY': return '⚪';
    case 'LEASED': return '🟡';
    case 'RUNNING': return '🔵';
    case 'VERIFYING': return '🟠';
    case 'COMMITTED': return '🟢';
    case 'ROLLBACK': return '🔴';
    case 'DONE': return '✅';
    case 'DEAD': return '💀';
    default: return '❓';
  }
}

/**
 * Get event emoji
 */
function getEventEmoji(kind: string): string {
  if (kind.includes('error')) return '🔴';
  if (kind.includes('warning')) return '🟡';
  if (kind.includes('success') || kind.includes('pass')) return '🟢';
  if (kind.includes('start')) return '▶️';
  if (kind.includes('complete') || kind.includes('done')) return '✅';
  if (kind.includes('heartbeat')) return '💓';
  return '📝';
}

/**
 * Format event description
 */
function formatEventDescription(event: EventData): string {
  const data = event.data || {};
  
  switch (event.kind) {
    case 'task_started':
      return 'Task started by ' + (data.agentId || 'unknown agent');
    case 'task_completed':
      return 'Task completed successfully';
    case 'task_failed':
      return 'Task failed: ' + (data.error || 'unknown error');
    case 'heartbeat':
      return 'Heartbeat from ' + (data.agentId || 'unknown') + ' (status: ' + (data.status || 'unknown') + ')';
    case 'message_enqueued':
      return 'Message enqueued: ' + (data.messageType || 'unknown');
    default:
      return event.kind.replace(/_/g, ' ');
  }
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

/**
 * Format duration in human readable format
 */
function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return hours + 'h ' + (minutes % 60) + 'm';
  } else if (minutes > 0) {
    return minutes + 'm ' + (seconds % 60) + 's';
  } else {
    return seconds + 's';
  }
}
