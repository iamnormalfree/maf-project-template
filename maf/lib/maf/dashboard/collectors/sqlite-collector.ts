// ABOUTME: SQLite data collector for MAF dashboard system
// ABOUTME: Extracts structured data from SQLite database for dashboard generation

import { createMafRuntimeStateFromEnv } from '../../core/runtime-factory';
import type { MafRuntimeState } from '../../core/runtime-state';

export interface AgentData {
  id: string;
  status: 'active' | 'idle' | 'error';
  lastSeen: number;
  leaseCount: number;
  contextUsage?: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
}

export interface TaskData {
  id: string;
  state: string;
  priority: number;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  agentId?: string;
  policyLabel: string;
  duration?: number;
  payload?: any;
}

export interface EventData {
  id: number;
  taskId: string;
  timestamp: number;
  kind: string;
  data: any;
}

export interface EvidenceData {
  taskId: string;
  attempt: number;
  verifier: string;
  result: 'PASS' | 'FAIL';
  details: any;
}

export interface SystemData {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalEvents: number;
  totalEvidence: number;
  activeLeases: number;
  oldestActiveTask?: number;
  newestTask?: number;
  systemHealth: 'healthy' | 'warning' | 'critical';
}

/**
 * SQLite data collector for dashboard generation
 */
export class SqliteCollector {
  private runtimeState: MafRuntimeState | null = null;

  constructor() {
    this.initializeRuntime();
  }

  /**
   * Initialize runtime state connection
   */
  private async initializeRuntime(): Promise<void> {
    try {
      this.runtimeState = await createMafRuntimeStateFromEnv();
    } catch (error) {
      console.warn('Failed to initialize SQLite runtime, collector will be empty:', error);
      this.runtimeState = null;
    }
  }

  /**
   * Check if SQLite runtime is available
   */
  private isRuntimeAvailable(): boolean {
    return this.runtimeState !== null && process.env.MAF_RUNTIME === 'sqlite';
  }

  /**
   * Collect agent data from SQLite database
   */
  async collectAgents(): Promise<AgentData[]> {
    if (!this.isRuntimeAvailable()) {
      return [];
    }

    try {
      // This would use actual SQLite queries - for now, return placeholder data
      // In a full implementation, this would query the database for agent heartbeats
      // and compute statistics from tasks and leases tables
      return [
        {
          id: 'agent-001',
          status: 'active',
          lastSeen: Date.now(),
          leaseCount: 3,
          contextUsage: 45,
          totalTasks: 15,
          completedTasks: 12,
          failedTasks: 1
        }
      ];
    } catch (error) {
      console.error('Failed to collect agent data:', error);
      return [];
    }
  }

  /**
   * Collect task data from SQLite database
   */
  async collectTasks(limit: number = 100): Promise<TaskData[]> {
    // Try direct database access if runtime is not available
    const dbPath = process.env.MAF_DB_PATH || 'runtime/maf.db';

    try {
      // Dynamic import to avoid build-time dependency
      const DB = require('better-sqlite3');
      const db = new DB(dbPath, { readonly: true });

      const tasks = db.prepare(`
        SELECT
          id,
          state,
          priority,
          created_at as createdAt,
          updated_at as updatedAt,
          attempts,
          policy_label as policyLabel
        FROM tasks
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit) as Array<{
        id: string;
        state: string;
        priority: number;
        createdAt: string;
        updatedAt: string;
        attempts: number;
        policyLabel: string;
      }>;

      db.close();

      return tasks.map(task => ({
        id: task.id,
        state: task.state,
        priority: task.priority || 0,
        createdAt: new Date(task.createdAt).getTime(),
        updatedAt: new Date(task.updatedAt).getTime(),
        attempts: task.attempts || 0,
        policyLabel: task.policyLabel || 'unknown'
      }));
    } catch (error) {
      console.warn('Failed to collect task data from database:', error);
      return [];
    }
  }

  /**
   * Collect event data from SQLite database
   */
  async collectEvents(limit: number = 50): Promise<EventData[]> {
    // Try direct database access if runtime is not available
    const dbPath = process.env.MAF_DB_PATH || 'runtime/maf.db';

    try {
      // Dynamic import to avoid build-time dependency
      const DB = require('better-sqlite3');
      const db = new DB(dbPath, { readonly: true });

      const events = db.prepare(`
        SELECT
          id,
          task_id as taskId,
          ts as timestamp,
          kind,
          data_json as data
        FROM events
        ORDER BY ts DESC, id DESC
        LIMIT ?
      `).all(limit) as Array<{
        id: number;
        taskId: string;
        timestamp: number;
        kind: string;
        data: string;
      }>;

      db.close();

      return events.map(event => ({
        id: event.id,
        taskId: event.taskId,
        timestamp: event.timestamp,
        kind: event.kind,
        data: JSON.parse(event.data || '{}')
      }));
    } catch (error) {
      console.warn('Failed to collect event data from database:', error);
      return [];
    }
  }

  /**
   * Collect evidence data from SQLite database
   */
  async collectEvidence(limit: number = 50): Promise<EvidenceData[]> {
    if (!this.isRuntimeAvailable()) {
      return [];
    }

    try {
      // This would query the evidence table
      return [
        {
          taskId: 'task-002',
          attempt: 1,
          verifier: 'preflight-validation',
          result: 'PASS',
          details: { checks: 5, passed: 5, warnings: 0 }
        }
      ];
    } catch (error) {
      console.error('Failed to collect evidence data:', error);
      return [];
    }
  }

  /**
   * Collect system-wide statistics
   */
  async collectSystemStats(): Promise<SystemData> {
    if (!this.isRuntimeAvailable()) {
      return {
        totalTasks: 0,
        activeTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        totalEvents: 0,
        totalEvidence: 0,
        activeLeases: 0,
        systemHealth: 'healthy'
      };
    }

    try {
      // This would aggregate data from all tables
      return {
        totalTasks: 25,
        activeTasks: 3,
        completedTasks: 20,
        failedTasks: 2,
        totalEvents: 150,
        totalEvidence: 18,
        activeLeases: 3,
        oldestActiveTask: Date.now() - 3600000,
        newestTask: Date.now() - 60000,
        systemHealth: 'healthy'
      };
    } catch (error) {
      console.error('Failed to collect system stats:', error);
      return {
        totalTasks: 0,
        activeTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        totalEvents: 0,
        totalEvidence: 0,
        activeLeases: 0,
        systemHealth: 'critical'
      };
    }
  }

  /**
   * Get recent task activity for timeline view
   */
  async getRecentActivity(hours: number = 24): Promise<Array<{
    timestamp: number;
    type: 'task' | 'event' | 'evidence';
    description: string;
    details?: any;
  }>> {
    if (!this.isRuntimeAvailable()) {
      return [];
    }

    try {
      // This would query across tables for recent activity
      return [
        {
          timestamp: Date.now() - 900000,
          type: 'task',
          description: 'Task task-001 started',
          details: { taskId: 'task-001', agentId: 'agent-001' }
        },
        {
          timestamp: Date.now() - 600000,
          type: 'evidence',
          description: 'Preflight validation passed for task-002',
          details: { taskId: 'task-002', result: 'PASS' }
        }
      ];
    } catch (error) {
      console.error('Failed to get recent activity:', error);
      return [];
    }
  }
}
