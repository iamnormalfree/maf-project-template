// ABOUTME: MAF pre-commit hook for file reservation conflict detection
// ABOUTME: Scans staged files, checks for reservation conflicts, and blocks commits when needed

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { FileReservationManager } from '../../lib/maf/reservation/file';
import type { MafReservationCheck } from '../../lib/maf/core/protocols';

export interface PreCommitHookConfig {
  repoPath?: string;
  dbPath?: string;
  agentId?: string;
  enableVerboseLogging?: boolean;
}

export interface ConflictCheckResult {
  shouldBlock: boolean;
  conflicts: Array<{
    filePath: string;
    leasedBy: string;
    expiresAt: number;
  }>;
  overrideUsed: boolean;
  agentId: string;
}

export interface StagedFileInfo {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

export class MafPreCommitHook {
  private config: Required<PreCommitHookConfig>;
  private reservationManager: FileReservationManager;

  constructor(config: PreCommitHookConfig = {}) {
    this.config = {
      repoPath: config.repoPath || process.cwd(),
      dbPath: config.dbPath || join(process.cwd(), '.maf', 'reservations.db'),
      agentId: config.agentId || process.env.MAF_AGENT_ID || 'git-hook-' + randomUUID().slice(0, 8),
      enableVerboseLogging: config.enableVerboseLogging || false
    };

    this.reservationManager = new FileReservationManager({
      dbPath: this.config.dbPath,
      agentId: this.config.agentId
    });
  }

  async initialize(): Promise<void> {
    await this.reservationManager.initialize();
    
    if (this.config.enableVerboseLogging) {
      console.log('MAF Pre-commit hook initialized');
      console.log('Agent ID:', this.config.agentId);
      console.log('Database path:', this.config.dbPath);
    }
  }

  async run(): Promise<number> {
    try {
      await this.initialize();

      // Get staged files
      const stagedFiles = await this.getStagedFiles();
      
      if (stagedFiles.length === 0) {
        if (this.config.enableVerboseLogging) {
          console.log('No staged files found');
        }
        return 0; // Success
      }

      if (this.config.enableVerboseLogging) {
        console.log('Checking', stagedFiles.length, 'staged file(s) for conflicts');
      }

      // Check for reservation conflicts
      const conflictResult = await this.checkReservationConflicts(stagedFiles);

      if (conflictResult.shouldBlock && !conflictResult.overrideUsed) {
        // Block the commit with actionable message
        const message = this.generateConflictMessage(conflictResult);
        console.error(message);
        return 1; // Failure
      }

      if (conflictResult.overrideUsed) {
        console.warn('⚠️  MAF Reservation Override Active');
        console.warn('Commit allowed due to MAF_RESERVATION_OVERRIDE environment variable');
      }

      if (this.config.enableVerboseLogging && !conflictResult.shouldBlock) {
        console.log('✅ No reservation conflicts found');
      }

      return 0; // Success

    } catch (error) {
      console.error('MAF Pre-commit hook failed:', error instanceof Error ? error.message : 'Unknown error');
      
      // Don't block commits on system errors, only on reservation conflicts
      console.warn('⚠️  Allowing commit due to system error (reservations may be ineffective)');
      return 0; // Success on system errors
    } finally {
      await this.cleanup();
    }
  }

  async getStagedFiles(): Promise<string[]> {
    // Check if we're in CI environment - if so, skip git operations
    if (this.shouldSkipGitCommands()) {
      if (this.config.enableVerboseLogging) {
        console.log('CI environment detected, skipping staged files check');
      }
      return [];
    }

    try {
      const diffOutput = this.runGitCommand(['diff', '--cached', '--name-only'], 'git diff --cached');

      if (diffOutput) {
        return diffOutput.split('\n').filter(file => file.length > 0);
      }

      return [];
    } catch (diffError) {
      if (this.config.enableVerboseLogging) {
        console.warn('Debug: git diff --cached failed:', diffError instanceof Error ? diffError.message : diffError);
        console.warn('Debug: attempting git status --porcelain fallback');
      }

      try {
        const statusOutput = this.runGitCommand(['status', '--porcelain'], 'git status --porcelain');

        if (!statusOutput) {
          return [];
        }

        const stagedFiles = statusOutput
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && ['A', 'M', 'R'].includes(line[0]))
          .map(line => {
            const rawPath = line.substring(3);
            const renameParts = rawPath.split(' -> ');
            return renameParts.pop()?.trim() || '';
          })
          .filter(file => file.length > 0);

        return stagedFiles;
      } catch (statusError) {
        throw new Error('Failed to read staged files: ' + (statusError instanceof Error ? statusError.message : 'Unknown git error'));
      }
    }
  }

  async checkReservationConflicts(stagedFiles: string[]): Promise<ConflictCheckResult> {
    try {
      const reservationCheck = await this.reservationManager.performReservationCheck(stagedFiles);
      
      return {
        shouldBlock: reservationCheck.allowOverride ? false : (reservationCheck.conflicts?.length ?? 0) > 0,
        conflicts: reservationCheck.conflicts || [],
        overrideUsed: reservationCheck.allowOverride,
        agentId: reservationCheck.agentId
      };

    } catch (error) {
      throw new Error('Failed to check reservation conflicts: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  generateConflictMessage(result: ConflictCheckResult): string {
    if (result.conflicts.length === 0) {
      return '';
    }

    let message = '\n🚫 MAF File Reservation Conflict\n';
    message += '================================\n\n';
    message += 'The following files are leased by other agents:\n\n';

    for (const conflict of result.conflicts) {
      const expiresTime = new Date(conflict.expiresAt).toLocaleString();
      message += `  • ${conflict.filePath}\n`;
      message += `    Leased by: ${conflict.leasedBy}\n`;
      message += `    Expires: ${expiresTime}\n\n`;
    }

    message += 'Options to resolve:\n';
    message += '1. Wait for the lease(s) to expire\n';
    message += '2. Contact the agent owner to release the lease\n';
    message += '3. Override with environment variable (not recommended for production):\n';
    message += '   MAF_RESERVATION_OVERRIDE=true git commit\n\n';
    message += 'Learn more about MAF file reservations in the documentation.\n';

    return message;
  }

  private isCIEnvironment(): boolean {
    return process.env.CI === 'true' ||
           process.env.GITHUB_ACTIONS === 'true' ||
           process.env.CI_NAME === 'GitHub Actions' ||
           process.env.CONTINUOUS_INTEGRATION === 'true';
  }

  private allowGitInCI(): boolean {
    return process.env.NODE_ENV === 'test' ||
           Boolean(process.env.JEST_WORKER_ID) ||
           process.env.MAF_ALLOW_GIT_IN_CI === 'true';
  }

  private shouldSkipGitCommands(): boolean {
    return this.isCIEnvironment() && !this.allowGitInCI();
  }

  private runGitCommand(args: string[], description: string): string {
    const result = spawnSync('git', args, {
      cwd: this.config.repoPath,
      encoding: 'utf8',
      timeout: 5000
    });

    const stdout = typeof result.stdout === 'string' ? result.stdout : '';

    if (result.error) {
      if (stdout.trim().length > 0) {
        return stdout.trim();
      }
      throw result.error;
    }

    if (typeof result.status === 'number' && result.status !== 0) {
      const stderr = typeof result.stderr === 'string' ? result.stderr : '';
      const message = stderr || `${description} exited with status ${result.status}`;
      throw new Error(message);
    }

    return stdout.trim();
  }

  private getGitRepositoryRoot(): string {
    // Check if we're in CI environment - if so, return current directory
    if (this.shouldSkipGitCommands()) {
      return process.cwd();
    }

    const gitRoot = this.runGitCommand(['rev-parse', '--show-toplevel'], 'git rev-parse --show-toplevel');
    if (!gitRoot) {
      throw new Error('Not in a git repository');
    }
    return gitRoot;
  }

  getAgentId(): string {
    return this.config.agentId;
  }

  // Testing utility methods
  async createTestReservation(reservation: {
    filePath: string;
    agentId: string;
    expiresAt: number;
  }): Promise<void> {
    if (reservation.agentId === this.config.agentId) {
      await this.reservationManager.acquireLease({
        filePath: reservation.filePath,
        durationMs: reservation.expiresAt - Date.now(),
        reason: 'Test reservation'
      });
      return;
    }

    const otherManager = new FileReservationManager({
      dbPath: this.config.dbPath,
      agentId: reservation.agentId
    });

    await otherManager.initialize();
    await otherManager.acquireLease({
      filePath: reservation.filePath,
      durationMs: reservation.expiresAt - Date.now(),
      reason: 'Test reservation'
    });
    await otherManager.close();
  }

  async cleanup(): Promise<void> {
    try {
      await this.reservationManager.close();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// CLI interface for standalone execution
export async function runMafPreCommitHook(config: PreCommitHookConfig = {}): Promise<number> {
  const hook = new MafPreCommitHook(config);
  return await hook.run();
}

// If run directly
if (require.main === module) {
  // Early exit for CI environments
  const isCIEnvironment = process.env.CI === 'true' ||
                          process.env.GITHUB_ACTIONS === 'true' ||
                          process.env.CI_NAME === 'GitHub Actions' ||
                          process.env.CONTINUOUS_INTEGRATION === 'true';

  const allowGitInCI = process.env.NODE_ENV === 'test' ||
                       Boolean(process.env.JEST_WORKER_ID) ||
                       process.env.MAF_ALLOW_GIT_IN_CI === 'true';

  if (isCIEnvironment && !allowGitInCI) {
    console.log('CI environment detected, pre-commit hook bypassed');
    process.exit(0);
  }

  const config: PreCommitHookConfig = {
    enableVerboseLogging: process.env.MAF_DEBUG === 'true'
  };

  runMafPreCommitHook(config)
    .then(exitCode => process.exit(exitCode))
    .catch(error => {
      console.error('Fatal error in pre-commit hook:', error);
      process.exit(1);
    });
}
// Test change for pre-commit hook
