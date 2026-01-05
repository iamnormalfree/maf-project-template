// ABOUTME: Tests for SQLite runtime state implementation

import { createSqliteRuntimeState, createSqliteRuntimeStateWithCleanup, type MafRuntimeStateWithCleanup } from '../core/runtime-factory';
import type { MafLease, MafHeartbeat } from '../core/runtime-state';
import type { MafTaskClaim } from '../core/protocols';
import { rmSync, existsSync } from 'fs';

describe('SQLite Runtime State', () => {
  const testDbPath = '/tmp/test-maf-runtime.db';

  beforeEach(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  afterEach(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  it('should initialize with correct schema', () => {
    const runtimeState = createSqliteRuntimeState(testDbPath);
    expect(runtimeState).toBeDefined();
    expect(typeof runtimeState.enqueue).toBe('function');
    expect(typeof runtimeState.acquireLease).toBe('function');
    expect(typeof runtimeState.releaseLease).toBe('function');
    expect(typeof runtimeState.upsertHeartbeat).toBe('function');
    expect(typeof runtimeState.refresh).toBe('function');
  });

  it('should handle lease acquisition and release', async () => {
    const runtimeState = createSqliteRuntimeState(testDbPath);
    
    const lease: MafLease = {
      filePath: '/test/file.ts',
      agentId: 'test-agent-1',
      expiresAt: Date.now() + 60000 // 1 minute from now
    };

    // Should acquire lease successfully
    await expect(runtimeState.acquireLease(lease)).resolves.not.toThrow();

    // Should fail to acquire same lease
    await expect(runtimeState.acquireLease(lease)).rejects.toThrow();

    // Should release lease successfully
    await expect(runtimeState.releaseLease(lease.filePath)).resolves.not.toThrow();

    // Should be able to acquire again after release
    await expect(runtimeState.acquireLease(lease)).resolves.not.toThrow();
  });

  it('should handle heartbeat operations', async () => {
    const runtimeState = createSqliteRuntimeState(testDbPath);
    
    const heartbeat: MafHeartbeat = {
      agentId: 'test-agent-1',
      lastSeen: Date.now(),
      status: 'working',
      contextUsagePercent: 75
    };

    // Should upsert heartbeat successfully
    await expect(runtimeState.upsertHeartbeat(heartbeat)).resolves.not.toThrow();
  });

  it('should handle message enqueueing', async () => {
    const runtimeState = createSqliteRuntimeState(testDbPath);
    
    const message: MafTaskClaim = {
      type: 'TASK_CLAIM',
      agentId: 'test-agent-1',
      beadId: 'test-bead-1',
      files: ['/test/file.ts'],
      etaMinutes: 5
    };

    // Should enqueue message successfully
    await expect(runtimeState.enqueue(message)).resolves.not.toThrow();
  });

  it('should handle refresh operations', async () => {
    const runtimeState = createSqliteRuntimeState(testDbPath);
    
    // Should refresh successfully
    await expect(runtimeState.refresh()).resolves.not.toThrow();
  });
});


import { createMafRuntimeStateFromEnv } from '../core/runtime-factory';

describe('SQLite Runtime Factory Extensions', () => {
  const testDbPath = '/tmp/test-maf-runtime-extensions.db';

  beforeEach(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  afterEach(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  describe('Runtime Factory with Environment Support', () => {
    it('should create SQLite runtime state via factory', async () => {
      const runtimeState = await createMafRuntimeStateFromEnv();

      expect(runtimeState).toBeDefined();
      expect(typeof runtimeState.enqueue).toBe('function');
      expect(typeof runtimeState.acquireLease).toBe('function');
      expect(typeof runtimeState.releaseLease).toBe('function');
      expect(typeof runtimeState.upsertHeartbeat).toBe('function');
      expect(typeof runtimeState.refresh).toBe('function');
    });

    it('should respect MAF_RUNTIME_MODE environment variable', async () => {
      // Test SQLite mode
      process.env.MAF_RUNTIME_MODE = 'sqlite';
      const sqliteRuntime = await createMafRuntimeStateFromEnv();
      expect(sqliteRuntime).toBeDefined();

      // Clean up for next test
      if ('close' in sqliteRuntime) {
        (sqliteRuntime as any).close();
      }

      // Test JSON mode
      process.env.MAF_RUNTIME_MODE = 'json';
      const jsonRuntime = await createMafRuntimeStateFromEnv();
      expect(jsonRuntime).toBeDefined();

      delete process.env.MAF_RUNTIME_MODE;
    });

    it('should fallback to JSON when SQLite unavailable', async () => {
      process.env.MAF_RUNTIME_MODE = 'sqlite,json';

      // Force SQLite to fail by using invalid path
      process.env.MAF_DB_PATH = '/invalid/path/test.db';
      const runtimeState = await createMafRuntimeStateFromEnv();
      expect(runtimeState).toBeDefined();

      delete process.env.MAF_RUNTIME_MODE;
      delete process.env.MAF_DB_PATH;
    });

    it('should create runtime state with cleanup function', () => {
      const runtimeState: MafRuntimeStateWithCleanup = createSqliteRuntimeStateWithCleanup(testDbPath);

      expect(runtimeState).toBeDefined();
      expect(typeof runtimeState.close).toBe('function');

      // Should not throw when closing (though deprecated)
      expect(() => runtimeState.close()).not.toThrow();
    });
  });

  describe('Migration Loading', () => {
    it('should load preflight schema extensions', async () => {
      const runtimeState = await createMafRuntimeStateFromEnv();

      // The preflight schema should be loaded without errors
      await expect(runtimeState.refresh()).resolves.not.toThrow();

      // Clean up if needed
      if ('close' in runtimeState) {
        (runtimeState as any).close();
      }
    });
  });

  describe('Advanced Database Operations', () => {
    it('should handle concurrent operations with transaction safety', async () => {
      const runtimeState = await createMafRuntimeStateFromEnv();

      const message: MafTaskClaim = {
        type: 'TASK_CLAIM',
        agentId: 'test-agent-concurrent-1',
        beadId: 'test-bead-concurrent-1',
        files: ['test-concurrent.txt'],
        etaMinutes: 5
      };

      // Test concurrent message enqueuing
      const promises = Array.from({ length: 10 }, (_, index) =>
        runtimeState.enqueue({
          ...message,
          agentId: `test-agent-concurrent-${index}`
        } as MafTaskClaim)
      );

      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Clean up if needed
      if ('close' in runtimeState) {
        (runtimeState as any).close();
      }
    });

    it('should handle transaction retries on database locks', async () => {
      // Force SQLite runtime for deterministic behavior
      process.env.MAF_RUNTIME = 'sqlite';
      const runtimeState = await createMafRuntimeStateFromEnv();

      // Use unique file path to avoid test pollution
      const uniquePath = `test-transaction-retries-${Date.now()}.txt`;
      const lease = {
        filePath: uniquePath,
        agentId: 'test-agent-transaction',
        expiresAt: Date.now() + 60000
      };

      // Test basic lease acquisition first
      await expect(runtimeState.acquireLease({
        ...lease,
        agentId: 'test-agent-sequential'
      })).resolves.not.toThrow();

      // Test that subsequent lease attempts fail
      await expect(runtimeState.acquireLease({
        ...lease,
        agentId: 'test-agent-sequential-fail'
      })).rejects.toThrow();

      // Clean up the lease for next test
      await runtimeState.releaseLease(lease.filePath);

      // Test concurrent lease attempts - exactly 5 as originally specified
      const leasePromises = Array.from({ length: 5 }, (_, index) =>
        runtimeState.acquireLease({
          ...lease,
          agentId: `test-agent-concurrent-${index}`
        })
      );

      const results = await Promise.allSettled(leasePromises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      // Exactly one should succeed, others should fail gracefully
      expect(successCount).toBe(1);

      // Clean up if needed
      if ('close' in runtimeState) {
        (runtimeState as any).close();
      }

      delete process.env.MAF_RUNTIME;
    });
  });

  describe('Database Performance and Cleanup', () => {
    it('should clean expired resources during refresh', async () => {
      const runtimeState = await createMafRuntimeStateFromEnv();

      // Add expired lease
      const expiredLease = {
        filePath: 'expired-test.txt',
        agentId: 'test-agent-expired',
        expiresAt: Date.now() - 1000 // Already expired
      };

      await runtimeState.acquireLease(expiredLease);

      // Add old heartbeat
      const oldHeartbeat = {
        agentId: 'old-agent',
        lastSeen: Date.now() - (10 * 60 * 1000), // 10 minutes ago
        status: 'idle' as const,
        contextUsagePercent: 0
      };

      await runtimeState.upsertHeartbeat(oldHeartbeat);

      // Refresh should clean expired resources
      await expect(runtimeState.refresh()).resolves.not.toThrow();

      // Clean up if needed
      if ('close' in runtimeState) {
        (runtimeState as any).close();
      }
    });
  });
});
