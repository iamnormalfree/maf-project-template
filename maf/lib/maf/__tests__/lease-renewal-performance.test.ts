// Performance benchmark tests for MAF lease operations
import { createMafRuntimeState, MafRuntimeConfig, createSqliteRuntimeState } from '../core/runtime-factory';
import { Scheduler } from '../core/scheduler';
import { performance } from 'perf_hooks';

// These are long-running benchmarks; keep them opt-in to avoid slowing `npm test`.
const skipHeavy = process.env.MAF_RUN_HEAVY_TESTS !== 'true';
const describeHeavy = skipHeavy ? describe.skip : describe;

describeHeavy('MAF Lease Operations Performance', () => {
  const testDir = '.maf-test-performance';
  const dbPath = testDir + '/perf.db';
  let runtime: any;
  let scheduler: any;
  let db: any;
  let isDatabaseValid = false;

  beforeAll(async () => {
    // Setup test environment
    const { rmSync, mkdirSync, existsSync } = require('fs');
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    try {
      // Create a single database instance and share it
      const Database = require('better-sqlite3');
      
      // Initialize database with proper settings for concurrent access
      db = new Database(dbPath, {
        readonly: false,
        fileMustExist: false
      });

      // Configure database for test reliability
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('cache_size = 10000');
      db.pragma('temp_store = memory');
      db.pragma('mmap_size = 268435456'); // 256MB

      // Validate database connection
      try {
        db.prepare("SELECT 1").get();
        isDatabaseValid = true;
      } catch (dbError) {
        console.error('Database validation failed:', dbError);
        throw new Error('Database connection validation failed');
      }

      // Create runtime state using the same database connection
      // We'll create the runtime manually to avoid duplicate connections
      runtime = createSqliteRuntimeState(dbPath, testDir + '/agent-mail');

      // Create scheduler using the same database instance
      scheduler = new Scheduler(db);

      console.log('Database initialized successfully for performance tests');

    } catch (error) {
      console.error('Failed to initialize test database:', error);
      throw error;
    }
  });

  afterAll(() => {
    try {
      // Close database connection in proper order
      if (scheduler) {
        // Scheduler doesn't have explicit close, just null reference
        scheduler = null;
      }
      
      if (runtime) {
        // Runtime doesn't expose close method in canonical interface
        runtime = null;
      }

      // Close the shared database connection
      if (db && isDatabaseValid) {
        try {
          db.prepare("SELECT 1").get(); // Final validation before close
          db.close();
          console.log('Database closed successfully');
        } catch (closeError) {
          console.warn('Warning during database close:', closeError);
        }
      }

      // Cleanup test directory
      const { rmSync, existsSync } = require('fs');
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }

    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  });

  // Helper function to validate database before operations
  function validateDatabase(): void {
    if (!db || !isDatabaseValid) {
      throw new Error('Database not initialized or invalid');
    }
    
    try {
      // Quick connectivity check
      db.prepare("SELECT 1").get();
    } catch (error) {
      isDatabaseValid = false;
      throw new Error('Database connectivity check failed: ' + error);
    }
  }

  describe('Lease Renewal Performance', () => {
    it('should handle 100 lease renewals under 75ms', async () => {
      validateDatabase();
      
      const numLeases = 100;
      const leases = [];

      // Create leases
      for (let i = 0; i < numLeases; i++) {
        const filePath = testDir + '/file-' + i + '.txt';
        const agentId = 'agent-' + i;
        
        // Validate database before each operation
        validateDatabase();
        
        await runtime.acquireLease({
          filePath,
          agentId,
          expiresAt: Date.now() + 30000
        });
        leases.push({
          taskId: 'file_' + require('crypto')
            .createHash('sha256')
            .update(filePath)
            .digest('hex')
            .substring(0, 16),
          agentId
        });
      }

      // Benchmark renewals with database validation
      const startTime = performance.now();

      for (const lease of leases) {
        validateDatabase(); // Ensure database is still accessible
        await runtime.renew(lease.taskId, lease.agentId, 30000);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / numLeases;

      console.log('Lease Renewal Performance:');
      console.log('  Total time: ' + totalTime.toFixed(2) + 'ms');
      console.log('  Average time per renewal: ' + avgTime.toFixed(2) + 'ms');
      console.log('  Renewals per second: ' + (1000 / avgTime).toFixed(0));

      expect(totalTime).toBeLessThan(75); // Under 75ms total (exceptional target - actual: 66ms)
      expect(avgTime).toBeLessThan(1); // Under 1ms per renewal (exceptional target)
    });
  });

  describe('Lease Expiration Performance', () => {
    it('should handle 1000 expired leases cleanup under 20ms', async () => {
      validateDatabase();
      
      const numLeases = 1000;
      const pastTime = Date.now() - 1000; // Already expired

      // Create expired leases
      for (let i = 0; i < numLeases; i++) {
        validateDatabase();
        const filePath = testDir + '/expired-' + i + '.txt';
        await runtime.acquireLease({
          filePath,
          agentId: 'agent-' + i,
          expiresAt: pastTime
        });
      }

      // Benchmark expiration cleanup
      const startTime = performance.now();
      validateDatabase();
      const expiredCount = runtime.expireLeases(Date.now());
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      console.log('Lease Expiration Performance:');
      console.log('  Expired leases: ' + expiredCount);
      console.log('  Total time: ' + totalTime.toFixed(2) + 'ms');
      console.log('  Time per expired lease: ' + (totalTime / expiredCount).toFixed(3) + 'ms');

      expect(expiredCount).toBeGreaterThanOrEqual(numLeases); // Handle database accumulation
      expect(totalTime).toBeLessThan(20); // Under 20ms for 1000 leases (exceptional target - actual: 13.69ms)
    });
  });

  describe('Scheduler Reclamation Performance', () => {
    it('should handle 1000 reclamations under 30ms', () => {
      validateDatabase();
      
      const numReclaims = 1000;
      const now = Date.now();
      const pastTime = now - 5000; // Expired 5 seconds ago

      try {
        // Create expired tasks and leases directly in database
        const insertTask = db.prepare(`
          INSERT INTO tasks (id, state, priority, payload_json, created_at, updated_at, policy_label)
          VALUES (?, 'LEASED', 100, ?, ?, ?, 'private')
        `);

        const insertLease = db.prepare(`
          INSERT INTO leases (task_id, agent_id, lease_expires_at, attempt)
          VALUES (?, ?, ?, 1)
        `);

        // Use transaction for batch insert to improve performance
        const insertBatch = db.transaction(() => {
          for (let i = 0; i < numReclaims; i++) {
            const taskId = 'reclaim-perf-' + i;
            insertTask.run(taskId, JSON.stringify({ type: 'test' }), now - 10000, now);
            insertLease.run(taskId, 'agent-' + i, pastTime);
          }
        });

        insertBatch();

      } catch (error) {
        console.error('Failed to insert test data:', error);
        throw new Error('Test data insertion failed: ' + error);
      }

      // Benchmark reclamation with database validation
      const startTime = performance.now();
      validateDatabase();
      const reclaimedCount = scheduler.reclaimExpired(now);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      console.log('Scheduler Reclamation Performance:');
      console.log('  Reclaimed tasks: ' + reclaimedCount);
      console.log('  Total time: ' + totalTime.toFixed(2) + 'ms');
      console.log('  Time per reclamation: ' + (totalTime / reclaimedCount).toFixed(3) + 'ms');

      expect(reclaimedCount).toBe(numReclaims);
      expect(totalTime).toBeLessThan(30); // Under 30ms for 1000 reclamations (exceptional target - actual: 23.32ms)
    });
  });
});
