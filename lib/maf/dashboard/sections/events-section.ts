// ABOUTME: Events section generator for MAF dashboard
// ABOUTME: Creates markdown section showing recent system events and activity

import type { EventData } from '../collectors/sqlite-collector';

export interface EventsSectionData {
  events: EventData[];
  lastUpdated: number;
}

/**
 * Generate events section for dashboard
 */
export function generateEventsSection(data: EventsSectionData): string {
  const { events, lastUpdated } = data;

  const lines = [
    '## 📅 System Events',
    '',
    '*Last updated: ' + new Date(lastUpdated).toISOString() + '*',
    ''
  ];

  if (events.length === 0) {
    lines.push('No recent events found in the system.');
    lines.push('');
    return lines.join('\n');
  }

  // Event type summary
  const eventSummary = getEventSummary(events);
  
  lines.push('### Event Types (Last 50)');
  lines.push('');
  lines.push('| Type | Count |');
  lines.push('|------|-------|');
  
  for (const [type, count] of Object.entries(eventSummary)) {
    const emoji = getEventEmoji(type);
    lines.push('| ' + emoji + ' ' + type.replace(/_/g, ' ') + ' | ' + count + ' |');
  }
  
  lines.push('');

  // Recent events timeline
  const sortedEvents = events
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30); // Show last 30 events

  lines.push('### Recent Events Timeline');
  lines.push('');

  let currentDate: string | null = null;
  
  for (const event of sortedEvents) {
    const eventDate = new Date(event.timestamp).toDateString();
    const time = new Date(event.timestamp).toLocaleTimeString();
    const relativeTime = formatRelativeTime(event.timestamp);
    const emoji = getEventEmoji(event.kind);
    
    // Add date header when date changes
    if (eventDate !== currentDate) {
      if (currentDate !== null) {
        lines.push(''); // Add spacing between days
      }
      lines.push('#### ' + eventDate);
      lines.push('');
      currentDate = eventDate;
    }
    
    lines.push('- **' + time + '** ' + emoji + ' `' + event.taskId + '`: ' + formatEventMessage(event));
    lines.push('  _' + relativeTime + '_');
    
    // Add event details if available
    if (event.data && Object.keys(event.data).length > 0) {
      const details = formatEventDetails(event.data);
      if (details) {
        lines.push('  <details><summary>Details</summary>');
        lines.push('');
        lines.push('  ```json');
        lines.push('  ' + JSON.stringify(event.data, null, 2).split('\n').join('\n  '));
        lines.push('  ```');
        lines.push('');
        lines.push('  </details>');
      }
    }
    
    lines.push('');
  }

  // Event patterns and insights
  lines.push('### Event Patterns');
  lines.push('');

  const errorEvents = events.filter(e => e.kind.includes('error') || e.kind.includes('fail'));
  const warningEvents = events.filter(e => e.kind.includes('warning'));
  
  if (errorEvents.length > 0) {
    lines.push('🔴 **Errors:** ' + errorEvents.length + ' error events detected');
    
    // Group errors by type
    const errorTypes: Record<string, number> = {};
    for (const error of errorEvents) {
      errorTypes[error.kind] = (errorTypes[error.kind] || 0) + 1;
    }
    
    for (const [type, count] of Object.entries(errorTypes)) {
      lines.push('  - ' + type + ': ' + count);
    }
    lines.push('');
  }

  if (warningEvents.length > 0) {
    lines.push('🟡 **Warnings:** ' + warningEvents.length + ' warning events detected');
    lines.push('');
  }

  // Activity frequency analysis
  const lastHour = events.filter(e => Date.now() - e.timestamp < 3600000);
  const last24Hours = events.filter(e => Date.now() - e.timestamp < 86400000);
  
  lines.push('### Activity Frequency');
  lines.push('');
  lines.push('- **Last hour:** ' + lastHour.length + ' events');
  lines.push('- **Last 24 hours:** ' + last24Hours.length + ' events');
  
  if (last24Hours.length > 0) {
    const avgPerHour = (last24Hours.length / 24).toFixed(1);
    lines.push('- **Average per hour:** ' + avgPerHour);
  }
  
  lines.push('');

  // Evidence links
  lines.push('### Evidence Links');
  lines.push('');
  lines.push('- **Full event logs:** [`../logs/`](../logs/)');
  lines.push('- **Task-specific evidence:** See individual task sections');
  lines.push('- **System state:** [`../state/`](../state/)');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get event type summary
 */
function getEventSummary(events: EventData[]): Record<string, number> {
  const summary: Record<string, number> = {};
  
  for (const event of events) {
    summary[event.kind] = (summary[event.kind] || 0) + 1;
  }
  
  return summary;
}

/**
 * Get event emoji
 */
function getEventEmoji(kind: string): string {
  if (kind.includes('error')) return '🔴';
  if (kind.includes('warning')) return '🟡';
  if (kind.includes('success') || kind.includes('pass') || kind.includes('complete')) return '🟢';
  if (kind.includes('start')) return '▶️';
  if (kind.includes('stop') || kind.includes('end')) return '⏹️';
  if (kind.includes('heartbeat')) return '💓';
  if (kind.includes('message')) return '📧';
  if (kind.includes('task')) return '📋';
  if (kind.includes('lease')) return '🔐';
  if (kind.includes('evidence')) return '🔍';
  if (kind.includes('verification') || kind.includes('verify')) return '✔️';
  return '📝';
}

/**
 * Format event message for display
 */
function formatEventMessage(event: EventData): string {
  const data = event.data || {};

  switch (event.kind) {
    case 'CLAIMED':
      return 'Task claimed by agent ' + (data.agent_id || 'unknown agent');
    case 'RUNNING':
      return 'Task started execution';
    case 'VERIFYING':
      return 'Task verification started';
    case 'COMMITTED':
      return 'Task completed successfully';
    case 'ERROR':
      const errorMsg = data.error && data.error.message ? data.error.message : 'Unknown error';
      return 'Task failed: ' + errorMsg;
    case 'LEASED':
      return 'Task leased to ' + (data.agentId || 'unknown agent');
    case 'QUOTA_EXCEEDED':
      return `${data.quota_type.toUpperCase()} quota exceeded: ${data.current_usage}/${data.limit}`;
    case 'QUOTA_WARNING':
      return `${data.quota_type.toUpperCase()} quota warning: ${data.current_usage}/${data.limit} (${data.threshold_percentage}%)`;
    case 'AGENT_STARTED':
      return `Agent ${data.agent_id} (${data.agent_type}) started`;
    case 'AGENT_STOPPED':
      return `Agent ${data.agent_id} stopped: ${data.reason}`;
    case 'AGENT_HEALTH_CHECK':
      return `Agent ${data.agent_id} health: ${data.status}`;
    case 'PERFORMANCE_THRESHOLD':
      return `${data.threshold_type} threshold: ${data.metric_name} ${data.direction} threshold (${data.current_value}/${data.threshold_value})`;
    case 'BACKPRESSURE_DETECTED':
      return `Backpressure in ${data.source}: ${data.pressure_percent}% capacity used`;
    case 'task_started':
      return 'Task started by ' + (data.agentId || 'unknown agent');
    case 'task_completed':
      return 'Task completed successfully';
    case 'task_failed':
      const taskError = data.error || data.message || 'unknown error';
      return 'Task failed: ' + taskError;
    case 'task_leased':
      return 'Task leased to ' + (data.agentId || 'unknown agent');
    case 'task_released':
      return 'Task lease released';
    case 'heartbeat':
      return 'Heartbeat from ' + (data.agentId || 'unknown') + ' (status: ' + (data.status || 'unknown') + ')';
    case 'message_enqueued':
      return 'Message enqueued: ' + (data.messageType || data.type || 'unknown');
    case 'evidence_collected':
      return 'Evidence collected for verification';
    case 'verification_passed':
      return 'Verification passed';
    case 'verification_failed':
      return 'Verification failed';
    case 'system_refresh':
      return 'System state refreshed';
    case 'cleanup_completed':
      return 'Cleanup completed: ' + (data.cleaned + ' items' || 'unknown');
    default:
      return event.kind.replace(/_/g, ' ');
  }
}

/**
 * Format event details for display
 */
function formatEventDetails(data: any): string {
  if (!data || typeof data !== 'object') {
    return '';
  }
  
  const details: string[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' || typeof value === 'number') {
      details.push(key + ': ' + value);
    }
  }
  
  return details.join(', ');
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
