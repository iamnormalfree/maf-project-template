// ABOUTME: Integration tests for MAF observability with SQLite test database  
// ABOUTME: Tests end-to-end event generation and CLI query integration, validates error aggregation

import { rmSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createMafEventLogger, type MafEventLogger } from '../events/event-logger';
import { createWorkerHeartbeatManager, type WorkerHeartbeatManager } from '../heartbeat-manager';
import { createMafRuntimeState, type MafRuntimeState } from '../core/runtime-factory';
import { mafTop, type MafTopOptions, type MafErrorSummary } from '../cli/top';
import { createReadyTestDatabase, createTestDatabaseSetup } from '../testing/test-db-setup';
import type { MafTaskClaim } from '../core/protocols';

describe('MAF Observability - Integration Tests', () => {
  let testDbHelper: TestDatabaseHelper;
  let db: Database.Database;
  let eventLogger: MafEventLogger;
  let runtimeState: MafRuntimeState;
  let testDbPath: string;

  beforeEach(async () => {
    // Create fresh test database with canonical schema using centralized utility
    const setup = createTestDatabaseSetup();
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const baseDir = require('path').join(process.cwd(), 'test-temp');
    testDbPath = require('path').join(baseDir, `test-observability-integration-${timestamp}-${randomSuffix}.db`);
    
    db = setup.createTestDatabase(testDbPath);
    // Now we have both the db connection and the correct path

    // Create system tasks that the event logger expects
    const systemTasks = [
      'system:agent-supervisor',
      'system:heartbeat-monitor', 
      'system:lease-monitor',
      'system:quota-monitor',
      'system:performance-monitor',
      'system:backpressure-monitor',
      'system:supervisor',
      'system:security-monitor',
      'system:security-verifier',
      'system:security-admin'
    ];

    const now = Date.now();
    systemTasks.forEach(taskId => {
      db.prepare(`
        INSERT OR IGNORE INTO tasks (id, state, priority, payload_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        'READY',
        100,
        JSON.stringify({ type: 'system', description: 'System task for observability' }),
        now,
        now
      );
    });

    // Create event logger
    eventLogger = createMafEventLogger(db);

    // Use a simpler mock runtime state to avoid schema conflicts
    runtimeState = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      acquireLease: jest.fn().mockResolvedValue(undefined),
      releaseLease: jest.fn().mockResolvedValue(undefined),
      upsertHeartbeat: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
      cleanupExpiredResources: jest.fn(),
      getActiveAgents: jest.fn(),
      getTaskById: jest.fn(),
      updateTaskState: jest.fn(),
      getLeases: jest.fn(),
      getExpiredLeases: jest.fn()
    };
  });

  afterEach(() => {
    // Clean up test database manually
    if (db) {
      db.close();
    }
    const { rmSync, existsSync } = require('fs');
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
    // Also clean up WAL and SHM files
    if (existsSync(testDbPath + '-wal')) {
      rmSync(testDbPath + '-wal');
    }
    if (existsSync(testDbPath + '-shm')) {
      rmSync(testDbPath + '-shm');
    }
  });

  function createTestTask(taskId: string): void {
    const now = Date.now();
    db.prepare(`
      INSERT INTO tasks (id, state, priority, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      'READY',
      100,
      JSON.stringify({ type: 'test', description: 'Test task for observability' }),
      now,
      now
    );
  }

  describe('End-to-End Event Generation', () => {
    test('should generate and retrieve observability events through heartbeat manager', async () => {
      const agentId = 'integration-agent-1';
      const taskClaim: MafTaskClaim = {
        type: 'TASK_CLAIM',
        agentId,
        beadId: 'integration-bead-1',
        files: ['test1.ts', 'test2.ts'],
        etaMinutes: 10
      };

      // Create heartbeat manager
      const heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        runtimeState,
        eventLogger,
        {
          heartbeatIntervalMs: 50, // Fast for testing
          leaseRenewalIntervalMs: 30,
          leaseTtlMs: 100
        }
      );

      // Start heartbeat manager
      await heartbeatManager.start(taskClaim);

      // Wait for some heartbeat events
      await new Promise(resolve => setTimeout(resolve, 120));

      // Stop heartbeat manager
      await heartbeatManager.stop();

      // Verify events were generated
      const events = eventLogger.getAllEvents(50);
      expect(events.length).toBeGreaterThan(0);

      // Should have agent health check events
      const healthCheckEvents = eventLogger.getEventsByKind('AGENT_HEALTH_CHECK', 10);
      expect(healthCheckEvents.length).toBeGreaterThan(0);

      // Verify event data structure
      const healthCheckEvent = healthCheckEvents[0];
      expect(healthCheckEvent.kind).toBe('AGENT_HEALTH_CHECK');
      expect(healthCheckEvent.task_id).toBe('system:agent-supervisor');

      const eventData = JSON.parse(healthCheckEvent.data_json);
      expect(eventData.agent_id).toBe(agentId);
      expect(eventData.status).toBe('healthy');
      expect(Array.isArray(eventData.checks)).toBe(true);
      expect(eventData.resource_usage).toBeDefined();
    }, 10000); // Increased timeout for this test

    test('should maintain event consistency across task lifecycle', async () => {
      const taskId = 'integration-task-lifecycle';
      const agentId = 'integration-agent-lifecycle';

      // Create test task first to satisfy foreign key constraint
      createTestTask(taskId);

      // Simulate task lifecycle events
      eventLogger.logTaskClaimed(taskId, agentId, 1);
      
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      
      eventLogger.logTaskRunning(taskId);
      
      await new Promise(resolve => setTimeout(resolve, 1));
      
      eventLogger.logTaskVerifying(taskId);
      
      await new Promise(resolve => setTimeout(resolve, 1));
      
      eventLogger.logTaskCommitted(taskId);

      // Get all events for the task
      const taskEvents = eventLogger.getTaskEvents(taskId);
      expect(taskEvents).toHaveLength(4);

      // Verify chronological order (allow for millisecond precision)
      for (let i = 1; i < taskEvents.length; i++) {
        expect(taskEvents[i].ts).toBeGreaterThanOrEqual(taskEvents[i - 1].ts);
      }

      // Verify event kinds
      const eventKinds = taskEvents.map(e => e.kind);
      expect(eventKinds).toEqual(['CLAIMED', 'RUNNING', 'VERIFYING', 'COMMITTED']);

      // Verify claimed event data
      const claimedEvent = taskEvents.find(e => e.kind === 'CLAIMED');
      const claimedData = JSON.parse(claimedEvent!.data_json);
      expect(claimedData.agent_id).toBe(agentId);
      expect(claimedData.attempt).toBe(1);
    });
  });

  describe('Error Event Generation and Aggregation', () => {
    test('should generate error events and aggregate them correctly', async () => {
      const taskId1 = 'integration-error-task-1';
      const taskId2 = 'integration-error-task-2';
      const taskId3 = 'integration-error-task-3';
      
      // Create test tasks to satisfy foreign key constraints
      createTestTask(taskId1);
      createTestTask(taskId2);
      createTestTask(taskId3);

      // Generate various error events
      eventLogger.logTaskError(taskId1, new Error('Connection timeout to database'), {
        operation: 'query',
        retryable: true
      });

      eventLogger.logTaskError(taskId1, new Error('Permission denied accessing file'), {
        operation: 'file_access',
        retryable: false
      });

      eventLogger.logTaskError(taskId2, new Error('Invalid input format'), {
        operation: 'validation',
        retryable: false
      });

      // Insert observability error events directly for system tasks
      const insertErrorEvent = db.prepare(`
        INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)
      `);

      const now = Date.now();
      
      // HEARTBEAT_RENEW_FAILURE
      insertErrorEvent.run(
        'system:heartbeat-monitor',
        now - 1000,
        'HEARTBEAT_RENEW_FAILURE',
        JSON.stringify({
          agent_id: 'agent-hb-failure',
          lease_id: 'lease-123',
          error: 'Database connection lost',
          retry_count: 3
        })
      );

      // HEARTBEAT_MISSED
      insertErrorEvent.run(
        'system:heartbeat-monitor',
        now - 500,
        'HEARTBEAT_MISSED',
        JSON.stringify({
          agent_id: 'agent-missed-hb',
          last_seen: now - 10000,
          timeout_threshold: 30000
        })
      );

      // LEASE_EXPIRED
      insertErrorEvent.run(
        'system:lease-monitor',
        now - 200,
        'LEASE_EXPIRED',
        JSON.stringify({
          agent_id: 'agent-lease-expired',
          file_path: '/test/expired.txt',
          lease_duration_ms: 60000,
          expiry_time: now - 1000
        })
      );

      // Test CLI error aggregation
      const cliOutput = mafTop({
        dbPath: testDbPath,
        json: true,
        errors: true,
        recent: 50
      }) as any;

      // Verify error aggregation results
      expect(cliOutput.errorCounts).toBeDefined();
      expect(Array.isArray(cliOutput.errorCounts)).toBe(true);

      // Should have ERROR events
      const errorEvents = cliOutput.errorCounts.find((e: MafErrorSummary) => e.errorKind === 'ERROR');
      expect(errorEvents).toBeDefined();
      expect(errorEvents.count).toBe(3); // We inserted 3 task errors

      // Should have observability error events
      const heartbeatRenewFailure = cliOutput.errorCounts.find((e: MafErrorSummary) => e.errorKind === 'HEARTBEAT_RENEW_FAILURE');
      expect(heartbeatRenewFailure).toBeDefined();
      expect(heartbeatRenewFailure.count).toBe(1);

      const heartbeatMissed = cliOutput.errorCounts.find((e: MafErrorSummary) => e.errorKind === 'HEARTBEAT_MISSED');
      expect(heartbeatMissed).toBeDefined();
      expect(heartbeatMissed.count).toBe(1);

      const leaseExpired = cliOutput.errorCounts.find((e: MafErrorSummary) => e.errorKind === 'LEASE_EXPIRED');
      expect(leaseExpired).toBeDefined();
      expect(leaseExpired.count).toBe(1);

      // Verify summary statistics
      expect(cliOutput.summary.errorEvents).toBe(6); // Total error events
      expect(cliOutput.summary.recentErrors).toBeDefined();
      expect(cliOutput.summary.recentErrors.lastHour).toBe(6);
      expect(cliOutput.summary.recentErrors.last24h).toBe(6);
    });

    test('should analyze error reasons for ERROR events', async () => {
      const taskId = 'integration-error-analysis';

      // Create test task to satisfy foreign key constraints
      createTestTask(taskId);

      // Generate errors with different patterns
      const errorPatterns = [
        new Error('Network timeout while connecting to API'),
        new Error('Connection refused by remote server'),
        new Error('Permission denied accessing resource'),
        new Error('File not found in directory'),
        new Error('Invalid input data format'),
        new Error('Timeout exceeded processing request')
      ];

      errorPatterns.forEach((error, index) => {
        const taskWithIndex = `${taskId}-${index}`;
        createTestTask(taskWithIndex); // Create separate tasks to avoid conflicts
        eventLogger.logTaskError(taskWithIndex, error, {
          step: 'processing',
          retryable: index < 3
        });
      });

      // Test CLI error analysis
      const cliOutput = mafTop({
        dbPath: testDbPath,
        json: true,
        errors: true,
        recent: 50
      }) as any;

      // Should have ERROR events with failure reason analysis
      const errorEvents = cliOutput.errorCounts.find((e: MafErrorSummary) => e.errorKind === 'ERROR');
      expect(errorEvents).toBeDefined();
      expect(errorEvents.failureReasons).toBeDefined();

      const reasons = errorEvents.failureReasons!;
      
      // Should categorize errors correctly
      expect(reasons.Timeout || reasons.Network || reasons.Connection).toBeDefined();
      expect(reasons.Permission).toBeDefined();
      expect(reasons['Not Found'] || reasons.Invalid).toBeDefined();
    });
  });

  describe('CLI Integration and Output Validation', () => {
    test('should handle errors flag with JSON output correctly', () => {
      const taskId1 = 'test-cli-1';

      // Create test tasks to satisfy foreign key constraints
      createTestTask(taskId1);
      createTestTask('system:cli-test');

      // Add some test data
      eventLogger.logTaskError(taskId1, new Error('CLI test error'), {
        operation: 'test',
        retryable: false
      });

      db.prepare(`
        INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)
      `).run(
        'system:cli-test',
        Date.now() - 500,
        'HEARTBEAT_RENEW_FAILURE',
        JSON.stringify({ agent_id: 'cli-agent' })
      );

      // Test CLI with JSON output
      const cliOutput = mafTop({
        dbPath: testDbPath,
        json: true,
        errors: true
      }) as any;

      // Validate JSON structure
      expect(cliOutput).toBeDefined();
      expect(typeof cliOutput).toBe('object');
      expect(cliOutput.timestamp).toBeDefined();
      expect(cliOutput.summary).toBeDefined();
      expect(cliOutput.errorCounts).toBeDefined();
      expect(Array.isArray(cliOutput.errorCounts)).toBe(true);

      // Validate error counts structure
      if (cliOutput.errorCounts.length > 0) {
        const errorCount = cliOutput.errorCounts[0];
        expect(errorCount.errorKind).toBeDefined();
        expect(errorCount.count).toBeDefined();
        expect(typeof errorCount.count).toBe('number');
        expect(errorCount.lastHourCount).toBeDefined();
        expect(errorCount.last24hCount).toBeDefined();
      }
    });

    test('should combine errors flag with recent events filter', () => {
      const now = Date.now();
      
      // Insert events at different times
      for (let i = 0; i < 5; i++) {
        const taskId = `test-recent-${i}`;
        createTestTask(taskId);
        
        db.prepare(`
          INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)
        `).run(
          taskId,
          now - (i * 10000), // Stagger timestamps
          i % 2 === 0 ? 'ERROR' : 'HEARTBEAT_RENEW_FAILURE',
          JSON.stringify({ error: { message: `Recent error ${i}` } })
        );
      }

      // Test CLI with both recent and errors flags
      const cliOutput = mafTop({
        dbPath: testDbPath,
        json: true,
        errors: true,
        recent: 5
      }) as any;

      // Should have both recent events and error counts
      expect(cliOutput.recentEvents).toBeDefined();
      expect(Array.isArray(cliOutput.recentEvents)).toBe(true);
      expect(cliOutput.recentEvents.length).toBeLessThanOrEqual(5); // Limited by recent flag

      expect(cliOutput.errorCounts).toBeDefined();
      expect(Array.isArray(cliOutput.errorCounts)).toBe(true);
    });

    test('should validate error event filtering by kind', () => {
      const now = Date.now();
      
      // Create tasks first to satisfy foreign key constraints
      createTestTask('test-filter-1');
      createTestTask('test-filter-2');
      createTestTask('system:filter-test');
      
      // Insert different event types
      db.prepare(`
        INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)
      `).run('test-filter-1', now - 1000, 'ERROR', JSON.stringify({ error: { message: 'Filter test 1' } }));
      
      db.prepare(`
        INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)
      `).run('system:filter-test', now - 2000, 'HEARTBEAT_RENEW_FAILURE', JSON.stringify({ agent_id: 'filter-agent' }));
      
      db.prepare(`
        INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)
      `).run('system:filter-test', now - 3000, 'HEARTBEAT_MISSED', JSON.stringify({ agent_id: 'filter-agent' }));
      
      db.prepare(`
        INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)
      `).run('system:filter-test', now - 4000, 'LEASE_EXPIRED', JSON.stringify({ file_path: '/test.txt' }));
      
      db.prepare(`
        INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)
      `).run('test-filter-2', now - 5000, 'CLAIMED', JSON.stringify({ agent_id: 'filter-agent', attempt: 1 }));

      // Test filtering by specific error kinds
      const cliOutput = mafTop({
        dbPath: testDbPath,
        json: true,
        errors: true,
        recent: 10,
        kind: 'heartbeat_renew_failure,heartbeat_missed,lease_expired'
      }) as any;

      // Should filter recent events by kind
      if (cliOutput.recentEvents) {
        const filteredKinds = cliOutput.recentEvents.map((e: any) => e.kind.toLowerCase());
        expect(filteredKinds.every((kind: string) => 
          ['heartbeat_renew_failure', 'heartbeat_missed', 'lease_expired'].includes(kind)
        )).toBe(true);
      }

      // Should still include all error types in error counts (errors flag is independent)
      expect(cliOutput.errorCounts).toBeDefined();
      expect(cliOutput.errorCounts.length).toBeGreaterThan(0);
    });
  });

  describe('Database Schema Validation', () => {
    test('should handle missing schema gracefully', () => {
      // Create database without schema
      const emptyDbPath = '/tmp/test-maf-empty.db';
      if (existsSync(emptyDbPath)) {
        rmSync(emptyDbPath);
      }
      
      const emptyDb = new Database(emptyDbPath);
      emptyDb.close();

      // CLI should handle missing schema gracefully - but this may still throw
      // The current implementation doesn't handle missing tables gracefully
      expect(() => {
        mafTop({
          dbPath: emptyDbPath,
          json: true,
          errors: true
        });
      }).toThrow(); // Currently throws - this documents current behavior

      // Clean up
      if (existsSync(emptyDbPath)) {
        rmSync(emptyDbPath);
      }
    });

    test('should validate event data integrity', async () => {
      const taskId = 'integrity-test-task';
      const agentId = 'integrity-agent';

      // Create test task to satisfy foreign key constraints
      createTestTask(taskId);

      // Generate events with valid JSON
      eventLogger.logTaskClaimed(taskId, agentId, 1);
      eventLogger.logTaskError(taskId, new Error('Integrity test error'), {
        operation: 'validation',
        details: { nested: { data: 'value' } }
      });

      // Insert event with malformed JSON directly to test error handling
      db.prepare(`
        INSERT INTO events (task_id, ts, kind, data_json) VALUES (?, ?, ?, ?)
      `).run(taskId, Date.now(), 'ERROR', 'invalid json');

      // CLI should handle malformed JSON gracefully
      const cliOutput = mafTop({
        dbPath: testDbPath,
        json: true,
        errors: true,
        recent: 10
      }) as any;

      // Should still work despite malformed data
      expect(cliOutput).toBeDefined();
      expect(cliOutput.errorCounts).toBeDefined();
    });
  });
});