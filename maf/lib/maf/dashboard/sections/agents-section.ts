// ABOUTME: Agents section generator for MAF dashboard
// ABOUTME: Creates markdown section showing agent status and activity

import type { AgentData } from '../collectors/sqlite-collector';
import type { StateSnapshot } from '../collectors/filesystem-collector';

export interface AgentsSectionData {
  agents: AgentData[];
  stateSnapshots: StateSnapshot[];
  lastUpdated: number;
}

/**
 * Generate agents section for dashboard
 */
export function generateAgentsSection(data: AgentsSectionData): string {
  const { agents, stateSnapshots, lastUpdated } = data;

  const lines = [
    '## 🤖 Agents Overview',
    '',
    '*Last updated: ' + new Date(lastUpdated).toISOString() + '*',
    ''
  ];

  if (agents.length === 0) {
    lines.push('No agents currently registered or active.');
    lines.push('');
    return lines.join('\n');
  }

  // Summary statistics
  const activeAgents = agents.filter(a => a.status === 'active').length;
  const idleAgents = agents.filter(a => a.status === 'idle').length;
  const errorAgents = agents.filter(a => a.status === 'error').length;

  lines.push('### Summary');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');
  lines.push('| 🟢 Active | ' + activeAgents + ' |');
  lines.push('| 🟡 Idle | ' + idleAgents + ' |');
  lines.push('| 🔴 Error | ' + errorAgents + ' |');
  lines.push('| **Total** | **' + agents.length + '** |');
  lines.push('');

  // Individual agent details
  lines.push('### Agent Details');
  lines.push('');

  for (const agent of agents) {
    const statusEmoji = getStatusEmoji(agent.status);
    const lastSeen = formatRelativeTime(agent.lastSeen);
    
    lines.push('#### ' + statusEmoji + ' ' + agent.id);
    lines.push('');
    lines.push('- **Status:** ' + agent.status);
    lines.push('- **Last Seen:** ' + lastSeen);
    lines.push('- **Active Leases:** ' + agent.leaseCount);
    
    if (agent.contextUsage !== undefined) {
      const usageEmoji = agent.contextUsage > 80 ? '🔴' : agent.contextUsage > 60 ? '🟡' : '🟢';
      lines.push('- **Context Usage:** ' + usageEmoji + ' ' + agent.contextUsage + '%');
    }
    
    lines.push('- **Task Statistics:**');
    lines.push('  - Total: ' + agent.totalTasks);
    lines.push('  - Completed: ' + agent.completedTasks);
    lines.push('  - Failed: ' + agent.failedTasks);
    const successRate = agent.totalTasks > 0 ? ((agent.completedTasks / agent.totalTasks) * 100).toFixed(1) : '0';
    lines.push('  - Success Rate: ' + successRate + '%');
    lines.push('');

    // Link to evidence if available
    const hasStateSnapshot = stateSnapshots.some(s => s.agentId === agent.id);
    if (hasStateSnapshot) {
      lines.push('**Evidence:** [State snapshots](../state/)' );
      lines.push('');
    }
  }

  // Agent health indicators
  lines.push('### Health Indicators');
  lines.push('');

  if (errorAgents > 0) {
    lines.push('🚨 **Attention Needed:** ' + errorAgents + ' agent(s) in error state');
    lines.push('');
  }

  if (idleAgents > activeAgents) {
    lines.push('🟡 **Note:** More agents idle than active - check workload distribution');
    lines.push('');
  }

  const agentsWithContext = agents.filter(a => a.contextUsage !== undefined);
  if (agentsWithContext.length > 0) {
    const avgContextUsage = agentsWithContext
      .reduce((sum, a) => sum + (a.contextUsage || 0), 0) / agentsWithContext.length;

    if (avgContextUsage > 80) {
      lines.push('🔴 **High Context Usage:** Average context usage above 80%');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Get status emoji for agent
 */
function getStatusEmoji(status: AgentData['status']): string {
  switch (status) {
    case 'active': return '🟢';
    case 'idle': return '🟡';
    case 'error': return '🔴';
    default: return '⚪';
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
