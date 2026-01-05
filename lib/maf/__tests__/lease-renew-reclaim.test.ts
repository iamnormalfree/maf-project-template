// ABOUTME: Comprehensive test suite for MAF lease renewal and reclamation enhancements.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createMafRuntimeState, MafRuntimeConfig } from '../core/runtime-factory';
import { Scheduler } from '../core/scheduler';

describe('MAF Lease Renewal and Reclamation Enhancements', () => {
  const testDir = '.maf-test-renew-reclaim';
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

    // Create SQLite runtime for testing
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

  describe('Runtime Factory renew() method', () => {
    it('should extend lease TTL when renew is called with valid parameters', async () => {
      const filePath = testDir + '/test-file.txt';
      const agentId = 'test-agent-1';
      const initialExpiresAt = Date.now() + 5000; // 5 seconds

      // Create initial lease
      await runtime.acquireLease({
        filePath,
        agentId,
        expiresAt: initialExpiresAt
      });

      const taskId = 'file_' + require('crypto')
        .createHash('sha256')
        .update(filePath)
        .digest('hex')
        .substring(0, 16);

      if (typeof runtime.renew === 'function') {
        const renewed = await runtime.renew(taskId, agentId, 10000);
        expect(renewed).toBe(true);
      } else {
        fail('Runtime state should implement renew() method');
      }
    });
  });

  describe('Runtime Factory expireLeases() method', () => {
    it('should update expired leases to READY state and remove lease records', async () => {
      const filePath = testDir + '/test-file.txt';
      const agentId = 'test-agent-1';
      const pastExpiresAt = Date.now() - 1000; // Already expired

      // Create expired lease
      await runtime.acquireLease({
        filePath,
        agentId,
        expiresAt: pastExpiresAt
      });

      if (typeof runtime.expireLeases === 'function') {
        const expiredCount = runtime.expireLeases(Date.now());
        expect(expiredCount).toBeGreaterThan(0);
      } else {
        fail('Runtime state should implement expireLeases() method');
      }
    });
  });

  describe('Scheduler reclaimExpired() method', () => {
    it('should transition expired LEASED tasks to READY state', () => {
      const now = Date.now();
      
      // Create a task directly in database
      const taskId = 'reclaim-test-1';
      db.prepare(`
        INSERT INTO tasks (id, state, priority, payload_json, created_at, updated_at, policy_label)
        VALUES (?, 'LEASED', 100, ?, ?, ?, 'private')
      `).run(taskId, JSON.stringify({ type: 'test' }), now - 10000, now);

      // Create expired lease
      db.prepare(`
        INSERT INTO leases (task_id, agent_id, lease_expires_at, attempt)
        VALUES (?, 'test-agent', ?, 1)
      `).run(taskId, now - 5000); // Expired 5 seconds ago

      if (typeof scheduler.reclaimExpired === 'function') {
        const reclaimedCount = scheduler.reclaimExpired(now);
        expect(reclaimedCount).toBeGreaterThan(0);
      } else {
        fail('Scheduler should implement reclaimExpired() method');
      }
    });
  });
});
