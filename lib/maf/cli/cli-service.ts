// ABOUTME: Provides the CLI service layer for MAF coordinator helper with enhanced task claiming and lease management.

import type { MafCoordinatorConfig, MafCoordinator } from '../core/coordinator';
import type { MafTaskSummary } from '../scheduling/scheduler';
import { createMafCoordinator } from '../core/coordinator';
import { beadsReady } from '../beads/cli';

/**
 * Options for claiming a task with lease integration
 */
export interface ClaimTaskOptions {
  /** Agent identifier requesting the task */
  agentId: string;
  /** Optional constraint filters to limit task selection */
  labelFilters?: string[];
  /** If true, simulate claiming without actually acquiring leases */
  dryRun?: boolean;
  /** Duration in milliseconds for the lease (default: 4 hours) */
  leaseDurationMs?: number;
}

/**
 * Result of a task claim operation
 */
export interface ClaimTaskResult {
  /** Whether the operation completed successfully */
  success: boolean;
  /** The claimed task (if successful) */
  task?: MafTaskSummary;
  /** List of file leases currently held by this agent */
  heldLeases?: string[];
  /** Any lease conflicts encountered during claiming */
  leaseConflicts?: LeaseConflict[];
  /** List of ready tasks (returned when no task was claimed) */
  readyTasks?: MafTaskSummary[];
  /** Human-readable message explaining the result */
  message: string;
}

/**
 * Options for listing ready tasks without claiming
 */
export interface ListReadyOptions {
  /** Optional constraint filters to limit task selection */
  labelFilters?: string[];
  /** Maximum number of tasks to return */
  limit?: number;
}

/**
 * Result of listing ready tasks
 */
export interface ReadyTasksResult {
  /** Whether the operation completed successfully */
  success: boolean;
  /** List of ready tasks that could be claimed */
  tasks: MafTaskSummary[];
  /** Total count of ready tasks */
  totalCount: number;
  /** Human-readable message */
  message: string;
}

/**
 * Details about a lease conflict
 */
export interface LeaseConflict {
  /** File path that has a conflict */
  file: string;
  /** Reason for the conflict */
  reason: string;
  /** When the conflicting lease expires */
  expiresAt?: number;
  /** Agent holding the conflicting lease */
  holdingAgent?: string;
}

/**
 * Custom error for CLI service operations
 */
export class MafCliError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MafCliError';
  }
}

/**
 * Default lease duration: 4 hours in milliseconds
 */
const DEFAULT_LEASE_DURATION_MS = 4 * 60 * 60 * 1000;

/**
 * Service layer for MAF CLI operations with enhanced lease management
 */
export class MafCliService {
  private readonly coordinator: MafCoordinator;
  
  constructor(private config: MafCoordinatorConfig) {
    this.coordinator = createMafCoordinator(config);
  }

  /**
   * Claim the next available task with lease integration
   * Implements optimistic eager leasing pattern for partial lease acquisition
   */
  async claimTask(options: ClaimTaskOptions): Promise<ClaimTaskResult> {
    try {
      const { agentId, labelFilters, dryRun = false, leaseDurationMs = DEFAULT_LEASE_DURATION_MS } = options;
      
      // Refresh runtime state to get latest lease information
      await this.coordinator.refreshRuntimeState();
      
      if (dryRun) {
        // For dry runs, just return ready tasks without claiming
        const readyResult = await this.listReadyTasks({ labelFilters });
        return {
          success: true,
          readyTasks: readyResult.tasks,
          message: `Dry run: ${readyResult.totalCount} ready tasks available`
        };
      }

      // Try to claim a task through the coordinator
      const task = await this.coordinator.claimNextTask(agentId);
      
      if (!task) {
        // No task available, list ready tasks for context
        const readyResult = await this.listReadyTasks({ labelFilters });
        return {
          success: false,
          readyTasks: readyResult.tasks,
          message: readyResult.totalCount > 0 
            ? `No task could be claimed. ${readyResult.totalCount} tasks are ready but may have conflicts.`
            : 'No tasks are currently ready for claiming.'
        };
      }

      // Acquire leases for task files (optimistic eager leasing)
      const leaseResults = await this.acquireTaskLeases(task, agentId, leaseDurationMs);
      
      // Handle partial lease acquisition gracefully
      if (leaseResults.conflicts.length > 0) {
        // We got a task but couldn't acquire all leases - this is acceptable
        return {
          success: true,
          task,
          heldLeases: leaseResults.acquired,
          leaseConflicts: leaseResults.conflicts,
          message: `Task claimed with partial lease acquisition. ${leaseResults.acquired.length} files leased, ${leaseResults.conflicts.length} conflicts.`
        };
      }

      // Full lease acquisition success
      return {
        success: true,
        task,
        heldLeases: leaseResults.acquired,
        message: `Task claimed successfully with ${leaseResults.acquired.length} file leases.`
      };

    } catch (error) {
      // Convert errors to structured result for CLI consumption
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('already leased')) {
        return {
          success: false,
          message: `Lease conflict: ${errorMessage}`,
          leaseConflicts: [{
            file: 'unknown',
            reason: errorMessage
          }]
        };
      }

      return {
        success: false,
        message: `Failed to claim task: ${errorMessage}`
      };
    }
  }

  /**
   * Release a specific lease for a file
   */
  async releaseLease(filePath: string, agentId: string): Promise<boolean> {
    try {
      await this.config.runtime.releaseLease(filePath);
      return true;
    } catch (error) {
      console.warn(`Failed to release lease for ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Release all leases held by an agent
   */
  async releaseAllLeases(agentId: string): Promise<{ released: string[]; failed: string[] }> {
    try {
      await this.coordinator.refreshRuntimeState();
      
      // Note: This would require extending the runtime state to query leases by agent
      // For now, we'll return a placeholder implementation
      return {
        released: [],
        failed: []
      };
    } catch (error) {
      return {
        released: [],
        failed: ['Failed to refresh runtime state']
      };
    }
  }

  /**
   * List ready tasks without claiming them (dry run)
   */
  async listReadyTasks(options: ListReadyOptions): Promise<ReadyTasksResult> {
    try {
      const { labelFilters, limit } = options;
      
      // Get ready tasks from beads
      let tasks = await beadsReady({
        cwd: this.config.agentMailRoot,
        // Convert labelFilters to constraint for beads compatibility
        constraint: labelFilters?.[0]
      });

      // Apply label filtering if multiple filters provided
      if (labelFilters && labelFilters.length > 1) {
        tasks = tasks.filter(task => 
          labelFilters.some(filter => 
            task.constraint === filter || 
            task.labels?.includes(filter)
          )
        );
      }

      // Apply limit if specified
      if (limit && limit > 0) {
        tasks = tasks.slice(0, limit);
      }

      // Convert to MafTaskSummary format
      const taskSummaries: MafTaskSummary[] = tasks.map(task => ({
        beadId: task.id,
        constraint: task.constraint,
        files: task.files,
        assignedAgent: task.assigned_to,
        title: task.title
      }));

      return {
        success: true,
        tasks: taskSummaries,
        totalCount: taskSummaries.length,
        message: `Found ${taskSummaries.length} ready tasks`
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        tasks: [],
        totalCount: 0,
        message: `Failed to list ready tasks: ${errorMessage}`
      };
    }
  }

  /**
   * Acquire leases for all files in a task
   * Implements optimistic eager leasing pattern
   */
  private async acquireTaskLeases(
    task: MafTaskSummary,
    agentId: string,
    leaseDurationMs: number
  ): Promise<{ acquired: string[]; conflicts: LeaseConflict[] }> {
    const acquired: string[] = [];
    const conflicts: LeaseConflict[] = [];

    if (!task.files || task.files.length === 0) {
      return { acquired: [], conflicts: [] };
    }

    const expiresAt = Date.now() + leaseDurationMs;

    for (const filePath of task.files) {
      try {
        await this.config.runtime.acquireLease({
          filePath,
          agentId,
          expiresAt
        });
        acquired.push(filePath);
      } catch (error) {
        // Handle lease conflicts gracefully
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        conflicts.push({
          file: filePath,
          reason: errorMessage,
          // Try to extract agent and expiry info from error message
          holdingAgent: this.extractAgentFromError(errorMessage),
          expiresAt: this.extractExpiryFromError(errorMessage)
        });
      }
    }

    return { acquired, conflicts };
  }

  /**
   * Extract agent ID from lease error message
   */
  private extractAgentFromError(errorMessage: string): string | undefined {
    const match = errorMessage.match(/already leased by (\w+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Extract expiry timestamp from lease error message
   */
  private extractExpiryFromError(errorMessage: string): number | undefined {
    const isoMatch = errorMessage.match(/until ([\d\-T:.Z]+)/);
    if (isoMatch) {
      return new Date(isoMatch[1]).getTime();
    }
    
    // Try to extract other timestamp formats
    const timestampMatch = errorMessage.match(/(\d{13})/); // Unix timestamp in ms
    return timestampMatch ? parseInt(timestampMatch[1]) : undefined;
  }

  /**
   * Get current lease status for an agent
   */
  async getLeaseStatus(agentId: string): Promise<{ activeLeases: string[]; expiredCount: number }> {
    try {
      await this.coordinator.refreshRuntimeState();
      
      // Note: This would require extending the runtime state to query leases by agent
      // For now, we'll return a placeholder implementation
      return {
        activeLeases: [],
        expiredCount: 0
      };
    } catch (error) {
      return {
        activeLeases: [],
        expiredCount: 0
      };
    }
  }
}

/**
 * Factory function to create a CLI service instance
 */
export function createMafCliService(config: MafCoordinatorConfig): MafCliService {
  return new MafCliService(config);
}
