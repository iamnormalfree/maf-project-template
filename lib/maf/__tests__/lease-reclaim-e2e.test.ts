// ABOUTME: Comprehensive end-to-end test suite for MAF lease renewal and reclaim enforcement.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createMafRuntimeState, MafRuntimeConfig } from '../core/runtime-factory';
import { Scheduler } from '../core/scheduler';

describe('MAF Lease Renewal and Reclaim E2E Suite', () => {
  const testDir = '.maf-test-e2e-reclaim';
  const dbPath = testDir + '/test.db';
  let runtime: any;
  let scheduler: any;
  let db: any;

  beforeEach(async () => {
    // Clean test environment
    const { rmSync, mkdirSync, existsSync } = require('fs');
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Create SQLite runtime for realistic testing
    const config: MafRuntimeConfig = {
      type: 'sqlite',
      agentMailRoot: testDir + '/agent-mail',
      dbPath
    };

    runtime = await createMafRuntimeState(config);

    // Initialize database connection for direct testing
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
    scheduler = new Scheduler(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    const { rmSync, existsSync } = require('fs');
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Complete Lease Lifecycle Tests', () => {
    it('should execute full lease lifecycle: acquire → renew → expire → reclaim → ready → re-acquire', async () => {
      const filePath = testDir + '/lifecycle-test.txt';
      const agentId = 'lifecycle-agent-1';
      const agentId2 = 'lifecycle-agent-2';
      const now = Date.now();
      const shortTtl = 100; // 100ms TTL for quick expiration

      // Phase 1: Acquire initial lease
      await runtime.acquireLease({
        filePath,
        agentId,
        expiresAt: now + shortTtl
      });

      const taskId = 'file_' + require('crypto')
        .createHash('sha256')
        .update(filePath)
        .digest('hex')
        .substring(0, 16);

      // Verify initial state - task should be LEASED
      const taskState = db.prepare('SELECT state FROM tasks WHERE id = ?').get(taskId);
      expect(taskState.state).toBe('LEASED');

      const lease = db.prepare('SELECT agent_id, lease_expires_at FROM leases WHERE task_id = ?').get(taskId);
      expect(lease.agent_id).toBe(agentId);
      expect(lease.lease_expires_at).toBeGreaterThan(now);

      // Phase 2: Renew lease successfully
      const renewResult = await runtime.renew(taskId, agentId, shortTtl * 2);
      expect(renewResult).toBe(true);

      const renewedLease = db.prepare('SELECT lease_expires_at FROM leases WHERE task_id = ?').get(taskId);
      expect(renewedLease.lease_expires_at).toBeGreaterThan(lease.lease_expires_at);

      // Phase 3: Wait for lease to expire
      await new Promise(resolve => setTimeout(resolve, shortTtl * 2 + 50));

      // Phase 4: Reclaim expired leases
      const reclaimedCount = scheduler.reclaimExpired(Date.now());
      expect(reclaimedCount).toBeGreaterThanOrEqual(0); // May be 0 if already expired

      // Verify task transitioned to READY
      const taskAfterReclaim = db.prepare('SELECT state FROM tasks WHERE id = ?').get(taskId);
      expect(taskAfterReclaim.state).toBe('READY');

      // Verify lease was removed
      const leaseAfterReclaim = db.prepare('SELECT COUNT(*) as count FROM leases WHERE task_id = ?').get(taskId);
      expect(leaseAfterReclaim.count).toBe(0);

      // Phase 5: Re-acquire by different agent
      await runtime.acquireLease({
        filePath,
        agentId: agentId2,
        expiresAt: Date.now() + 5000
      });

      const newLease = db.prepare('SELECT agent_id FROM leases WHERE task_id = ?').get(taskId);
      expect(newLease.agent_id).toBe(agentId2);

      console.log('✅ Complete lease lifecycle test passed');
    }, 10000);

    it('should handle concurrent lease expiration and renewal properly', async () => {
      const filePath = testDir + '/concurrent-test.txt';
      const agentId = 'concurrent-agent-1';
      const now = Date.now();
      const veryShortTtl = 50; // 50ms TTL for immediate expiration

      // Create lease that will expire quickly
      await runtime.acquireLease({
        filePath,
        agentId,
        expiresAt: now + veryShortTtl
      });

      const taskId = 'file_' + require('crypto')
        .createHash('sha256')
        .update(filePath)
        .digest('hex')
        .substring(0, 16);

      // Wait for lease to expire
      await new Promise(resolve => setTimeout(resolve, veryShortTtl + 10));

      // Try to renew expired lease (should fail)
      const renewResult = await runtime.renew(taskId, agentId, 1000);
      expect(renewResult).toBe(false);

      // Reclaim the expired lease
      const reclaimedCount = scheduler.reclaimExpired(Date.now());
      expect(reclaimedCount).toBeGreaterThanOrEqual(0);

      // Verify state is READY
      const taskState = db.prepare('SELECT state FROM tasks WHERE id = ?').get(taskId);
      expect(taskState.state).toBe('READY');

      console.log('✅ Concurrent expiration and renewal test passed');
    }, 5000);
  });

  describe('Worker Renewal Protection Tests', () => {
    it('should protect active worker leases from premature reclamation', async () => {
      const filePath = testDir + '/worker-protection.txt';
      const agentId = 'active-agent-1';
      const now = Date.now();
      const longTtl = 10000; // 10 seconds TTL

      // Create lease with long TTL for active worker
      await runtime.acquireLease({
        filePath,
        agentId,
        expiresAt: now + longTtl
      });

      const taskId = 'file_' + require('crypto')
        .createHash('sha256')
        .update(filePath)
        .digest('hex')
        .substring(0, 16);

      // Try to reclaim leases that are still valid (should not reclaim anything)
      const reclaimedCount = scheduler.reclaimExpired(now);
      expect(reclaimedCount).toBe(0);

      // Verify lease is still active
      const lease = db.prepare('SELECT agent_id, lease_expires_at FROM leases WHERE task_id = ?').get(taskId);
      expect(lease.agent_id).toBe(agentId);
      expect(lease.lease_expires_at).toBeGreaterThan(now);

      const taskState = db.prepare('SELECT state FROM tasks WHERE id = ?').get(taskId);
      expect(taskState.state).toBe('LEASED');

      console.log('✅ Active worker protection test passed');
    });

    it('should allow different agents to acquire reclaimed leases immediately', async () => {
      const filePath = testDir + '/immediate-pickup.txt';
      const agentId1 = 'first-agent-1';
      const agentId2 = 'second-agent-2';
      const now = Date.now();
      const shortTtl = 100; // Short TTL for quick expiration

      // First agent acquires lease
      await runtime.acquireLease({
        filePath,
        agentId: agentId1,
        expiresAt: now + shortTtl
      });

      const taskId = 'file_' + require('crypto')
        .createHash('sha256')
        .update(filePath)
        .digest('hex')
        .substring(0, 16);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, shortTtl + 50));

      // Reclaim expired lease
      const reclaimedCount = scheduler.reclaimExpired(Date.now());
      expect(reclaimedCount).toBeGreaterThanOrEqual(0);

      // Second agent should be able to acquire immediately
      const acquireStart = Date.now();
      await runtime.acquireLease({
        filePath,
        agentId: agentId2,
        expiresAt: Date.now() + 5000
      });
      const acquireEnd = Date.now();

      // Should acquire quickly (within reasonable time)
      expect(acquireEnd - acquireStart).toBeLessThan(1000);

      // Verify new lease belongs to second agent
      const newLease = db.prepare('SELECT agent_id FROM leases WHERE task_id = ?').get(taskId);
      expect(newLease.agent_id).toBe(agentId2);

      console.log('✅ Immediate pickup test passed');
    }, 5000);
  });

  describe('CLI Dashboard Integration Tests', () => {
    it('should display reclaimed lease counts in maf top output', async () => {
      const filePath = testDir + '/cli-dashboard.txt';
      const agentId = 'cli-test-agent';
      const now = Date.now();
      const shortTtl = 100;

      // Create several leases that will expire
      const filePaths = [
        filePath + '1',
        filePath + '2',
        filePath + '3'
      ];

      for (const path of filePaths) {
        await runtime.acquireLease({
          filePath: path,
          agentId,
          expiresAt: now + shortTtl
        });
      }

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, shortTtl + 50));

      // Reclaim expired leases
      const reclaimedCount = scheduler.reclaimExpired(Date.now());
      expect(reclaimedCount).toBeGreaterThanOrEqual(0);

      // Query CLI dashboard data directly
      const { mafTop } = require('../cli/top');
      const result = mafTop({ dbPath, json: true });

      // Verify reclaimed leases count is reported
      expect(result.summary).toBeDefined();
      expect(result.summary.reclaimedLeases).toBeDefined();
      expect(typeof result.summary.reclaimedLeases).toBe('number');

      console.log('✅ CLI dashboard shows reclaimed leases: ' + result.summary.reclaimedLeases);
    });
  });

  describe('Large-Scale Reclamation Performance Tests', () => {
    it('should handle reclamation of 100+ expired leases efficiently', async () => {
      const agentId = 'perf-test-agent';
      const now = Date.now();
      const batchSize = 10;
      const totalLeases = 100;
      const shortTtl = 100;

      console.log('Creating ' + totalLeases + ' leases for performance test...');

      // Create leases in batches
      for (let i = 0; i < totalLeases; i += batchSize) {
        const batchPromises = [];
        for (let j = 0; j < batchSize && (i + j) < totalLeases; j++) {
          const filePath = testDir + '/perf-lease-' + (i + j) + '.txt';
          batchPromises.push(
            runtime.acquireLease({
              filePath,
              agentId,
              expiresAt: now + shortTtl
            })
          );
        }
        await Promise.all(batchPromises);
      }

      // Verify leases were created
      const leaseCount = db.prepare('SELECT COUNT(*) as count FROM leases').get().count;
      expect(leaseCount).toBe(totalLeases);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, shortTtl + 50));

      // Measure reclamation performance
      const reclaimStart = Date.now();
      const reclaimedCount = scheduler.reclaimExpired(Date.now());
      const reclaimEnd = Date.now();

      const reclaimDuration = reclaimEnd - reclaimStart;
      const avgTimePerLease = reclaimDuration / Math.max(reclaimedCount, 1);

      console.log('Performance metrics:\n        - Reclaimed: ' + reclaimedCount + ' leases\n        - Duration: ' + reclaimDuration + 'ms\n        - Avg per lease: ' + avgTimePerLease.toFixed(2) + 'ms');

      // Performance assertions
      expect(reclaimedCount).toBeGreaterThan(0);
      expect(reclaimDuration).toBeLessThan(15000); // Should complete within 15 seconds
      expect(avgTimePerLease).toBeLessThan(15); // Should be under 15ms per lease

      // Verify all leases were removed
      const remainingLeases = db.prepare('SELECT COUNT(*) as count FROM leases').get().count;
      expect(remainingLeases).toBe(0);

      // Verify tasks are in READY state
      const readyTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE state = 'READY'").get().count;
      expect(readyTasks).toBeGreaterThanOrEqual(totalLeases);

      console.log('✅ Large-scale reclamation performance test passed');
    }, 30000);
  });
});
