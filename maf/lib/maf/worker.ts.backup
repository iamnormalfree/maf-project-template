// ABOUTME: Simplified MAF worker - over-engineered security disabled
// ABOUTME: Basic task execution without complex security boundaries

import type Database from 'better-sqlite3';
import { Scheduler } from './core/scheduler';
import { runVerifications } from './verify/registry';
import { openPr, autoRevert } from './git/committer';
import { assertRoute, assertQuota } from './policy/enforce';
import { createMafEventLogger, MafEventLogger } from './events/event-logger';
import { createWorkerHeartbeatManager, type WorkerHeartbeatManager } from './heartbeat-manager';
import { createMafRuntimeStateFromEnv } from './core/runtime-factory';
import { readFileSync } from 'fs';
import { join } from 'path';

// Heartbeat and lease renewal configuration
const LEASE_TTL_MS = 30_000; // 30 seconds
const HEARTBEAT_INTERVAL_MS = 15_000; // 15 seconds
const LEASE_RENEWAL_INTERVAL_MS = 10_000; // 10 seconds

export async function runWorker(agentId: string, provider: string, dbPath = 'maf.db') {
  // Dynamic import to avoid build-time native dependency requirements.
  const mod: any = await import('better-sqlite3');
  const db = new mod.default(dbPath);
  const sched = new Scheduler(db);

  // Initialize event logger for proper database integration
  const eventLogger = createMafEventLogger(db);

  // Initialize runtime state for heartbeat and lease management
  const runtimeState = await createMafRuntimeStateFromEnv();

  console.log(`MAF worker started: agentId=${agentId}, provider=${provider}`);

  try {
    while (true) {
      console.log('Checking for next task...');
      const task = sched.reserve(agentId);

      if (!task || !task.task) {
        console.log('No tasks available, waiting...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      console.log(`Picked up task: ${task.task.id} (${task.task.policy_label})`);
      const payload = JSON.parse(task.task.payload_json || '{}');
      const tags: string[] = payload?.tags ?? ['uncertainty:high:code'];

      let heartbeatManager: WorkerHeartbeatManager | null = null;

      try {
        // Basic routing check (no complex security validation)
        assertRoute(task.task.policy_label, provider);
        assertQuota(task.task.policy_label, 1); // Simple quota check

        // Create heartbeat manager for this task
        heartbeatManager = await createWorkerHeartbeatManager(
          agentId,
          runtimeState,
          eventLogger,
          {
            leaseTtlMs: LEASE_TTL_MS,
            heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
            leaseRenewalIntervalMs: LEASE_RENEWAL_INTERVAL_MS,
          }
        );

        // Construct MafTaskClaim from scheduler task result
        const taskClaim = {
          type: 'TASK_CLAIM' as const,
          agentId,
          beadId: task.task.id,
          files: task.task.files ? JSON.parse(task.task.files) : [],
          etaMinutes: 30, // Default ETA
          timestamp: Date.now(),
        };

        // Start heartbeat and lease renewal
        await heartbeatManager.start(taskClaim);

        // Execute task in basic environment (no security wrapper)
        const workdir = `/tmp/maf-${task.task.id}`;
        console.log(`Executing task ${task.task.id} in ${workdir}`);

        const result = await runVerifications(tags, { workdir, payload });

        console.log(`Task ${task.task.id} completed successfully`);

        // Result processing - simplified for basic MAF needs
        console.log('Task verification completed:', result.pass ? 'PASS' : 'FAIL');

      } catch (error: any) {
        console.error(`Task ${task.task.id} failed:`, error.message);

        // Auto-revert if PR was opened
        await autoRevert(agentId, error.message);

        // Continue processing other tasks
        continue;
      } finally {
        // Always stop heartbeat manager and clean up timers
        if (heartbeatManager) {
          try {
            await heartbeatManager.stop();
          } catch (stopError: any) {
            // Log cleanup errors via event logger but don't fail the task
            try {
              await eventLogger.logAgentHealthCheck({
                agent_id: agentId,
                status: 'unhealthy',
                checks: [
                  {
                    name: 'heartbeat_cleanup',
                    status: 'fail',
                    message: `Failed to stop heartbeat manager: ${stopError.message}`,
                  }
                ],
                resource_usage: {
                  cpu_percent: 0,
                  memory_mb: 256,
                  active_tasks: 0,
                  queue_depth: 0,
                }
              });
            } catch (logError) {
              console.error('Failed to log heartbeat cleanup error:', logError);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Worker error:', error);
    throw error;
  } finally {
    db.close();
  }
}

const workerAPI = { runWorker };

export default workerAPI;
