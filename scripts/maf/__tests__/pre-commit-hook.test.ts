// ABOUTME: TDD tests for MAF pre-commit hook
// ABOUTME: Tests staged file scanning, conflict detection, and commit blocking

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { MafPreCommitHook } from '../pre-commit-hook';

const tmpRoot = join(process.cwd(), 'tmp', 'maf-pre-commit-tests');

describe('MafPreCommitHook (TDD)', () => {
  let preCommitHook: MafPreCommitHook;
  let testRepoPath: string;
  let testDbPath: string;
  let mockSpawnSync: jest.SpyInstance;

  beforeEach(async () => {
    // Mock setup
    const childProcess = require('node:child_process');
    mockSpawnSync = jest.spyOn(childProcess, 'spawnSync');
    
    // Create unique test repository
    testRepoPath = join(tmpRoot, 'test-repo-' + randomUUID());
    testDbPath = join(testRepoPath, '.maf', 'test-reservations.db');
    
    mkdirSync(testRepoPath, { recursive: true });
    mkdirSync(join(testRepoPath, '.maf'), { recursive: true });

    preCommitHook = new MafPreCommitHook({
      repoPath: testRepoPath,
      dbPath: testDbPath,
      agentId: 'test-agent-' + randomUUID()
    });

    // Initialize the hook
    await preCommitHook.initialize();

    mockSpawnSync.mockImplementation((command: string, args?: ReadonlyArray<string>) => {
      if (command === 'git' && args?.[0] === 'diff') {
        return {
          status: 0,
          stdout: 'src/test-file.ts\nsrc/another-file.ts\n',
          stderr: ''
        } as any;
      }
      if (command === 'git' && args?.[0] === 'status') {
        return {
          status: 0,
          stdout: 'M  src/test-file.ts\nM  src/another-file.ts\n',
          stderr: ''
        } as any;
      }

      return {
        status: 0,
        stdout: '',
        stderr: ''
      } as any;
    });
  });

  afterEach(async () => {
    await preCommitHook.cleanup();
    // Cleanup test repository
    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }
    mockSpawnSync.mockRestore();
  });

  describe('Staged File Detection', () => {
    it('should detect staged files from git', async () => {
      const stagedFiles = await preCommitHook.getStagedFiles();

      expect(stagedFiles).toHaveLength(2);
      expect(stagedFiles).toContain('src/test-file.ts');
      expect(stagedFiles).toContain('src/another-file.ts');
    });

    it('should handle empty staged files', async () => {
      mockSpawnSync.mockImplementation((command: string, args?: ReadonlyArray<string>) => {
        if (command === 'git' && args?.[0] === 'diff') {
          return { status: 0, stdout: '', stderr: '' } as any;
        }
        return { status: 0, stdout: '', stderr: '' } as any;
      });

      const stagedFiles = await preCommitHook.getStagedFiles();

      expect(stagedFiles).toHaveLength(0);
    });

    it('should handle git command failures', async () => {
      mockSpawnSync.mockImplementation(() => {
        return {
          status: 1,
          stderr: 'git command failed',
          error: new Error('git command failed')
        } as any;
      });

      await expect(preCommitHook.getStagedFiles()).rejects.toThrow(/git command failed/);
    });

    it('should fall back to git status when diff command is blocked', async () => {
      mockSpawnSync.mockImplementationOnce(() => {
        return {
          status: 1,
          stderr: 'spawn EPERM',
          error: Object.assign(new Error('spawn EPERM'), { code: 'EPERM' })
        } as any;
      }).mockImplementationOnce(() => {
        return {
          status: 0,
          stdout: 'M  src/fallback-file.ts\n',
          stderr: ''
        } as any;
      });

      const stagedFiles = await preCommitHook.getStagedFiles();

      expect(stagedFiles).toEqual(['src/fallback-file.ts']);
    });

    it('should use stdout even when git sets an error flag', async () => {
      mockSpawnSync.mockImplementationOnce(() => {
        return {
          status: 0,
          stdout: 'src/direct-output.ts\n',
          stderr: '',
          error: new Error('spawn EPERM')
        } as any;
      });

      const stagedFiles = await preCommitHook.getStagedFiles();

      expect(stagedFiles).toEqual(['src/direct-output.ts']);
    });
  });

  describe('Reservation Conflict Detection', () => {
    it('should block commit when conflicts exist', async () => {
      const stagedFiles = ['src/conflict-file.ts'];
      
      // Create conflicting reservation
      const otherAgentId = 'other-agent';
      await preCommitHook.createTestReservation({
        filePath: 'src/conflict-file.ts',
        agentId: otherAgentId,
        expiresAt: Date.now() + 60000
      });

      const result = await preCommitHook.checkReservationConflicts(stagedFiles);

      expect(result.shouldBlock).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].filePath).toBe('src/conflict-file.ts');
      expect(result.conflicts[0].leasedBy).toBe(otherAgentId);
    });

    it('should allow commit when no conflicts exist', async () => {
      const stagedFiles = ['src/free-file.ts'];

      const result = await preCommitHook.checkReservationConflicts(stagedFiles);

      expect(result.shouldBlock).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should ignore own reservations', async () => {
      const stagedFiles = ['src/own-file.ts'];
      
      // Create reservation with same agent
      await preCommitHook.createTestReservation({
        filePath: 'src/own-file.ts',
        agentId: preCommitHook.getAgentId(),
        expiresAt: Date.now() + 60000
      });

      const result = await preCommitHook.checkReservationConflicts(stagedFiles);

      expect(result.shouldBlock).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should ignore expired reservations', async () => {
      const stagedFiles = ['src/expired-file.ts'];
      
      // Create expired reservation
      await preCommitHook.createTestReservation({
        filePath: 'src/expired-file.ts',
        agentId: 'other-agent',
        expiresAt: Date.now() - 60000 // Expired
      });

      const result = await preCommitHook.checkReservationConflicts(stagedFiles);

      expect(result.shouldBlock).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe('Override Mechanism', () => {
    it('should respect override environment variable', async () => {
      const originalEnv = process.env.MAF_RESERVATION_OVERRIDE;
      process.env.MAF_RESERVATION_OVERRIDE = 'true';

      const stagedFiles = ['src/conflict-file.ts'];
      
      // Create conflicting reservation
      await preCommitHook.createTestReservation({
        filePath: 'src/conflict-file.ts',
        agentId: 'other-agent',
        expiresAt: Date.now() + 60000
      });

      const result = await preCommitHook.checkReservationConflicts(stagedFiles);

      expect(result.shouldBlock).toBe(false); // Should not block due to override
      expect(result.overrideUsed).toBe(true);

      // Restore environment
      if (originalEnv) {
        process.env.MAF_RESERVATION_OVERRIDE = originalEnv;
      } else {
        delete process.env.MAF_RESERVATION_OVERRIDE;
      }
    });

    it('should not override when environment variable is not set', async () => {
      const stagedFiles = ['src/conflict-file.ts'];
      
      // Ensure override is not set
      delete process.env.MAF_RESERVATION_OVERRIDE;
      
      // Create conflicting reservation
      await preCommitHook.createTestReservation({
        filePath: 'src/conflict-file.ts',
        agentId: 'other-agent',
        expiresAt: Date.now() + 60000
      });

      const result = await preCommitHook.checkReservationConflicts(stagedFiles);

      expect(result.shouldBlock).toBe(true);
      expect(result.overrideUsed).toBe(false);
    });
  });

  describe('Error Handling and Messaging', () => {
    it('should provide actionable error messages', async () => {
      const stagedFiles = ['src/conflict-file.ts'];
      const otherAgentId = 'other-agent';
      
      await preCommitHook.createTestReservation({
        filePath: 'src/conflict-file.ts',
        agentId: otherAgentId,
        expiresAt: Date.now() + 60000
      });

      const result = await preCommitHook.checkReservationConflicts(stagedFiles);
      const message = preCommitHook.generateConflictMessage(result);

      expect(message).toContain('MAF File Reservation Conflict');
      expect(message).toContain('src/conflict-file.ts');
      expect(message).toContain(otherAgentId);
      expect(message).toContain('MAF_RESERVATION_OVERRIDE');
    });

    it('should handle multiple conflicts in single message', async () => {
      const stagedFiles = ['src/file1.ts', 'src/file2.ts'];
      
      await preCommitHook.createTestReservation({
        filePath: 'src/file1.ts',
        agentId: 'agent1',
        expiresAt: Date.now() + 60000
      });

      await preCommitHook.createTestReservation({
        filePath: 'src/file2.ts',
        agentId: 'agent2',
        expiresAt: Date.now() + 60000
      });

      const result = await preCommitHook.checkReservationConflicts(stagedFiles);
      const message = preCommitHook.generateConflictMessage(result);

      expect(message).toContain('src/file1.ts');
      expect(message).toContain('src/file2.ts');
      expect(message).toContain('agent1');
      expect(message).toContain('agent2');
    });
  });

  describe('Performance with Large File Sets', () => {
    it('should handle large numbers of staged files efficiently', async () => {
      // Create large file list
      const stagedFiles = Array.from({ length: 1000 }, (_, i) => 'src/file-' + i + '.ts');

      const startTime = Date.now();
      const result = await preCommitHook.checkReservationConflicts(stagedFiles);
      const duration = Date.now() - startTime;

      expect(result.shouldBlock).toBe(false);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
