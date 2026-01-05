// ABOUTME: Provides a minimal SQLite-backed scheduler and lease manager with renewal and events.
// ABOUTME: Works alongside beads-based flow by offering exactly-once-ish task reservation semantics.

// Note: better-sqlite3 types omitted to avoid build-time dependency issues
import { TaskState } from './state';
import { createMafEventLogger, MafEventLogger } from '../events/event-logger';

export class Scheduler {
  private eventLogger: MafEventLogger;

  constructor(private db: any) {
    this.eventLogger = createMafEventLogger(db);
  }

  reserve(agent_id: string, ttlMs = 30_000): null | {
    task: any;
    attempt: number;
    lease_expires_at: number;
  } {
    const now = Date.now();
    const tx = (this.db as any).transaction(() => {
      // expire leases
      this.db
        .prepare(
          `UPDATE tasks SET state='READY', updated_at=?
           WHERE state='LEASED' AND id IN (
             SELECT task_id FROM leases WHERE lease_expires_at < ?
           )`,
        )
        .run(now, now);

      this.db.prepare(`DELETE FROM leases WHERE lease_expires_at < ?`).run(now);

      // pick next
      const row = this.db
        .prepare(
          `SELECT * FROM tasks WHERE state='READY' ORDER BY priority ASC, created_at ASC LIMIT 1`,
        )
        .get();
      if (!row) return null;

      const attempt = (row.attempts || 0) + 1;
      this.db
        .prepare(`UPDATE tasks SET state=?, attempts=?, updated_at=? WHERE id=?`)
        .run(TaskState.LEASED, attempt, now, row.id);

      const lease_expires_at = now + ttlMs;
      this.db
        .prepare(
          `INSERT OR REPLACE INTO leases(task_id, agent_id, lease_expires_at, attempt)
           VALUES(?,?,?,?)`,
        )
        .run(row.id, agent_id, lease_expires_at, attempt);

      // Log both CLAIMED and LEASED events for compatibility
      this.eventLogger.logTaskClaimed(row.id, agent_id, attempt);
      this.db
        .prepare(`INSERT INTO events(task_id, ts, kind, data_json) VALUES(?,?,?,json(?))`)
        .run(row.id, now, 'LEASED', JSON.stringify({ agent_id, attempt }));

      return { task: row, attempt, lease_expires_at };
    });

    return tx();
  }

  renew(task_id: string, agent_id: string, ttlMs = 30_000): boolean {
    const now = Date.now();
    const r = this.db
      .prepare(`UPDATE leases SET lease_expires_at=? WHERE task_id=? AND agent_id=?`)
      .run(now + ttlMs, task_id, agent_id);
    return r.changes === 1;
  }

  start(task_id: string): void {
    const now = Date.now();
    this.db.prepare(`UPDATE tasks SET state=?, updated_at=? WHERE id=?`).run(TaskState.RUNNING, now, task_id);

    // Use event logger for consistency (prevents duplicate RUNNING events)
    this.eventLogger.logTaskRunning(task_id);
  }

  /**
   * Mark a task as entering verification phase.
   * Called when a worker starts running verifications for the task.
   */
  verifying(task_id: string): void {
    const now = Date.now();
    this.db.prepare(`UPDATE tasks SET state=?, updated_at=? WHERE id=?`).run(TaskState.VERIFYING, now, task_id);
    this.eventLogger.logTaskVerifying(task_id);
  }

  /**
   * Mark a task as successfully completed and committed.
   * Called when all verifications pass and the task is ready for final state.
   */
  committed(task_id: string): void {
    const now = Date.now();
    this.db.prepare(`UPDATE tasks SET state=?, updated_at=? WHERE id=?`).run(TaskState.COMMITTED, now, task_id);
    this.eventLogger.logTaskCommitted(task_id);
  }

  /**
   * Log an error for a task during execution.
   * Called when a task encounters an error that needs to be recorded.
   */
  error(task_id: string, err: Error, context?: Record<string, any>): void {
    const now = Date.now();
    this.eventLogger.logTaskError(task_id, err, context);
    
    // Optionally update task state based on error severity/context
    const shouldRollback = context?.retryable !== true;
    if (shouldRollback) {
      this.db.prepare(`UPDATE tasks SET state=?, updated_at=? WHERE id=?`).run(TaskState.ROLLBACK, now, task_id);
    }
  }

  /**
   * Get all events for a specific task.
   * Useful for debugging and audit trails.
   */
  getTaskEvents(task_id: string): any[] {
    return this.eventLogger.getTaskEvents(task_id);
  }

  /**
   * Pick the next task for an agent, returning a task summary.
   * This method implements the MafScheduler interface expected by the coordinator.
   */
  async pickNextTask(agentId: string): Promise<{
    beadId: string;
    constraint?: string;
    files?: string[];
    assignedAgent?: string | null;
    title?: string;
  } | null> {
    const reservation = this.reserve(agentId);
    if (!reservation) {
      return null;
    }

    const task = reservation.task;
    return {
      beadId: task.id,
      constraint: task.constraint,
      files: task.files ? JSON.parse(task.files) : undefined,
      assignedAgent: agentId,
      title: task.title || task.description,
    };
  }
  /**
   * Reclaim expired leases by transitioning LEASED tasks to READY state
   * and removing the expired lease records
   */
  /**
   * Reclaim expired leases by transitioning LEASED tasks to READY state
   * and removing the expired lease records. Emits lease expiration events.
   */
  reclaimExpired(now: number = Date.now()): number {
    const tx = (this.db as any).transaction(() => {
      // Get details of expired leases before we delete them (for event logging)
      const expiredLeases = this.db
        .prepare(`
          SELECT l.task_id, l.agent_id, l.lease_expires_at, t.state as task_state
          FROM leases l
          LEFT JOIN tasks t ON l.task_id = t.id
          WHERE l.lease_expires_at <= ?
        `)
        .all(now);

      // Emit lease expiration events for each expired lease
      for (const lease of expiredLeases) {
        const timeSinceExpiry = now - lease.lease_expires_at;
        const taskState = lease.task_state || 'unknown';
        
        this.eventLogger.logLeaseExpired({
          agent_id: lease.agent_id,
          task_id: lease.task_id,
          lease_expires_at: lease.lease_expires_at,
          expiration_detected_at: now,
          time_since_expiry_ms: timeSinceExpiry,
          task_state: taskState,
          renewal_attempts_made: 0, // We don't track this in the scheduler
          last_renewal_attempt: undefined,
          task_reclaimed: true,
          reclamation_action: timeSinceExpiry > 60000 ? 'requires_manual_intervention' : 'ready_for_retry',
        });
      }

      // Update expired LEASED tasks to READY state
      const expiredTasksResult = this.db
        .prepare(
          `UPDATE tasks SET state='READY', updated_at=?
           WHERE state='LEASED' AND id IN (
             SELECT task_id FROM leases WHERE lease_expires_at <= ?
           )`,
        )
        .run(now, now);

      // Remove expired leases
      const deleteExpiredLeases = this.db
        .prepare(`DELETE FROM leases WHERE lease_expires_at <= ?`)
        .run(now);

      const totalReclaimed = expiredTasksResult.changes;
      if (totalReclaimed > 0) {
        console.log(`Reclaimed ${totalReclaimed} expired leases back to READY state`);
      }

      return totalReclaimed;
    });

    return tx();
  }
}
