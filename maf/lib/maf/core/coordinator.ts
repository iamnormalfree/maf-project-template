// ABOUTME: Provides the high-level coordination surface for multi-agent workflows.
// ABOUTME: Integrates event logging for complete task lifecycle tracking.

import type { MafProtocolEnvelope } from './protocols';
import type { MafRuntimeState } from './runtime-state';
import type { MafScheduler, MafTaskSummary } from '../scheduling/scheduler';
import type { MafEventLogger } from '../events/event-logger';

export interface MafCoordinatorConfig {
  runtime: MafRuntimeState;
  /**
   * Path to the beads CLI executable.
   * Example: \`\${process.cwd()}/node_modules/.bin/beads\`
   */
  beadsExecutable: string;
  /**
   * Filesystem path for agent mail data (inbox/outbox/reservations).
   */
  agentMailRoot: string;
  scheduler?: MafScheduler;
  /**
   * Optional event logger for task lifecycle tracking.
   */
  eventLogger?: MafEventLogger;
}

export interface MafCoordinator {
  readonly config: MafCoordinatorConfig;
  dispatch(message: MafProtocolEnvelope): Promise<void>;
  refreshRuntimeState(): Promise<void>;
  claimNextTask(agentId: string): Promise<MafTaskSummary | null>;
}

export function createMafCoordinator(config: MafCoordinatorConfig): MafCoordinator {
  return {
    config,
    async dispatch(message) {
      // Log dispatch events if event logger is available
      if (config.eventLogger) {
        // Use correct event logger methods based on message type
        switch (message.type) {
          case 'TASK_CLAIM':
            // FIXED: Removed duplicate CLAIMED event logging
            // Per blueprint: scheduler is single source of truth for CLAIMED events
            // Coordinator should not log CLAIMED events for TASK_CLAIM messages
            break;
          case 'WORK_COMPLETE':
            // FIXED: Only log verifying event, not both verifying and committed
            // The coordinator dispatches work completion, which triggers verification
            // The actual commitment happens after successful verification by the scheduler
            config.eventLogger.logTaskVerifying(message.beadId);
            break;
        }
      }

      // Placeholder: actual implementation will route to beads / agent mail as needed.
      config.runtime.enqueue(message);
    },
    async refreshRuntimeState() {
      await config.runtime.refresh();
    },
    async claimNextTask(agentId) {
      if (!config.scheduler) {
        return null;
      }

      // FIX #3: Add await to handle async scheduler call
      const task = await config.scheduler.pickNextTask(agentId);

      // FIXED: Removed duplicate CLAIMED event logging
      // Per blueprint: scheduler (via reserve() or pickNextTask()) is single source of truth
      // Coordinator should not generate additional CLAIMED events
      
      // Note: Individual scheduler implementations are responsible for
      // logging their own CLAIMED events when tasks are assigned

      return task;
    },
  };
}
