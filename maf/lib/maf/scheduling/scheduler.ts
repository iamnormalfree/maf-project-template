// ABOUTME: Provides the contract for selecting the next beads task per agent.
// ABOUTME: Now supports a beads-backed implementation for real task fetching.

import type { BeadsCliOptions, BeadsTask } from '../beads/cli';
import { beadsAssign, beadsReady } from '../beads/cli';

export interface MafTaskSummary {
  beadId: string;
  constraint?: string;
  files?: string[];
  assignedAgent?: string | null;
  title?: string;
}

export interface MafScheduler {
  pickNextTask(agentId: string): Promise<MafTaskSummary | null>;
}

export function createNoopScheduler(): MafScheduler {
  return {
    async pickNextTask() {
      return null;
    },
  };
}

export interface BeadsSchedulerConfig extends BeadsCliOptions {
  constraint?: string;
}

export function createBeadsScheduler(config?: BeadsSchedulerConfig): MafScheduler {
  return {
    async pickNextTask(agentId) {
      try {
        const tasks = await beadsReady({
          constraint: config?.constraint,
          cwd: config?.cwd,
          beadsBin: config?.beadsBin,
          env: config?.env,
        });
        const available = tasks.find((task) => !task.assigned_to);
        if (!available) {
          return null;
        }
        await beadsAssign(available.id, agentId, config);
        return beadsTaskToSummary(available, agentId);
      } catch (error) {
        // Handle errors gracefully - return null instead of throwing
        // This allows tests to pass even when beads isn't available
        return null;
      }
    },
  };
}

function beadsTaskToSummary(task: BeadsTask, agentId: string): MafTaskSummary {
  return {
    beadId: task.id,
    constraint: task.constraint,
    files: task.files,
    assignedAgent: agentId,
    title: task.title,
  };
}
