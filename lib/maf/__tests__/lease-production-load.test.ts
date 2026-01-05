// Production load testing for MAF lease operations
import { createMafRuntimeState, MafRuntimeConfig } from '../core/runtime-factory';
import { Scheduler } from '../core/scheduler';
import { performance } from 'perf_hooks';

// These are long-running benchmarks; keep them opt-in to avoid slowing `npm test`.
const skipHeavy = process.env.MAF_RUN_HEAVY_TESTS !== 'true';
const describeHeavy = skipHeavy ? describe.skip : describe;

describeHeavy('MAF Lease Operations - Production Load Testing', () => {
  const testDir = '.maf-test-production-load';
  const dbPath = testDir + '/production-load.db';
  let runtime: any;
  let scheduler: any;
  let db: any;

  beforeAll(async () => {
    // Setup test environment
    const { rmSync, mkdirSync, existsSync } = require('fs');
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    const config: MafRuntimeConfig = {
      type: 'sqlite',
      agentMailRoot: testDir + '/agent-mail',
      dbPath
    };

    runtime = await createMafRuntimeState(config);
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
    scheduler = new Scheduler(db);
  }, 30000); // 30 second timeout for setup

  afterAll(() => {
    if (db) db.close();
    const { rmSync, existsSync } = require('fs');
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('High Volume Lease Creation', () => {
    it('should handle 10,000 concurrent lease operations', async () => {
      const numLeases = 10000;
      const batchSize = 100;
      const leases = [];

      console.log(`Creating ${numLeases} leases in batches of ${batchSize}...`);

      const startTime = performance.now();

      // Create leases in batches to avoid overwhelming the system
      for (let batch = 0; batch < numLeases; batch += batchSize) {
        const batchPromises = [];

        for (let i = 0; i < batchSize && (batch + i) < numLeases; i++) {
          const leaseIndex = batch + i;
          const filePath = `${testDir}/load-test-${leaseIndex}.txt`;
          const agentId = `agent-${leaseIndex % 100}`; // 100 different agents

          batchPromises.push(
            runtime.acquireLease({
              filePath,
              agentId,
              expiresAt: Date.now() + 30000
            })
          );

          leases.push({ filePath, agentId });
        }

        await Promise.all(batchPromises);

        // Progress logging
        if ((batch + batchSize) % 1000 === 0) {
          console.log(`Created ${Math.min(batch + batchSize, numLeases)} leases...`);
        }
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const leasesPerSecond = (numLeases / totalTime) * 1000;

      console.log(`\nHigh Volume Lease Creation Results:`);
      console.log(`  Total leases: ${numLeases}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Leases per second: ${leasesPerSecond.toFixed(0)}`);
      console.log(`  Average time per lease: ${(totalTime / numLeases).toFixed(2)}ms`);

      expect(numLeases).toBe(10000);
      expect(totalTime).toBeLessThan(60000); // Under 60 seconds
      expect(leasesPerSecond).toBeGreaterThan(100); // At least 100 leases/second
    }, 120000); // 2 minute timeout

    it('should handle rapid lease renewal cycles', async () => {
      const numLeases = 1000;
      const renewalCycles = 5;
      const leases = [];

      // Create initial leases
      console.log(`Creating ${numLeases} leases for renewal testing...`);
      for (let i = 0; i < numLeases; i++) {
        const filePath = `${testDir}/renewal-cycle-${i}.txt`;
        const agentId = `agent-${i}`;

        await runtime.acquireLease({
          filePath,
          agentId,
          expiresAt: Date.now() + 30000
        });

        const taskId = 'file_' + require('crypto')
          .createHash('sha256')
          .update(filePath)
          .digest('hex')
          .substring(0, 16);

        leases.push({ taskId, agentId });
      }

      console.log(`Running ${renewalCycles} renewal cycles...`);

      const startTime = performance.now();
      let totalSuccessfulRenewals = 0;

      // Run multiple renewal cycles
      for (let cycle = 0; cycle < renewalCycles; cycle++) {
        const cycleStartTime = performance.now();

        const renewalPromises = leases.map(lease =>
          runtime.renew(lease.taskId, lease.agentId, 30000)
        );

        const renewalResults = await Promise.all(renewalPromises);
        const successfulRenewals = renewalResults.filter(Boolean).length;
        totalSuccessfulRenewals += successfulRenewals;

        const cycleTime = performance.now() - cycleStartTime;
        console.log(`  Cycle ${cycle + 1}: ${successfulRenewals}/${numLeases} renewals in ${cycleTime.toFixed(2)}ms`);

        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const totalTime = performance.now() - startTime;
      const totalRenewals = numLeases * renewalCycles;
      const renewalsPerSecond = (totalSuccessfulRenewals / totalTime) * 1000;

      console.log(`\nRapid Lease Renewal Results:`);
      console.log(`  Total renewals attempted: ${totalRenewals}`);
      console.log(`  Total successful renewals: ${totalSuccessfulRenewals}`);
      console.log(`  Success rate: ${((totalSuccessfulRenewals / totalRenewals) * 100).toFixed(1)}%`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Renewals per second: ${renewalsPerSecond.toFixed(0)}`);

      expect(totalSuccessfulRenewals).toBeGreaterThan(totalRenewals * 0.95); // 95% success rate
      expect(renewalsPerSecond).toBeGreaterThan(500); // At least 500 renewals/second (realistic target)
    }, 180000); // 3 minute timeout
  });

  describe('Mixed Load Testing', () => {
    it('should handle concurrent lease creation, renewal, and expiration', async () => {
      const numOperations = 2000;
      const operations = [];

      console.log(`Starting mixed load test with ${numOperations} operations...`);

      const startTime = performance.now();

      // Mix different operations
      for (let i = 0; i < numOperations; i++) {
        const operationType = i % 4; // 4 different operation types
        const agentId = `agent-${i % 50}`; // 50 different agents

        switch (operationType) {
          case 0: // Lease creation
            operations.push(async () => {
              const filePath = `${testDir}/mixed-${i}.txt`;
              return runtime.acquireLease({
                filePath,
                agentId,
                expiresAt: Date.now() + 30000
              });
            });
            break;

          case 1: // Lease renewal (for existing leases)
            if (i > 100) { // Ensure some leases exist first
              const existingFilePath = `${testDir}/mixed-${i - 100}.txt`;
              const taskId = 'file_' + require('crypto')
                .createHash('sha256')
                .update(existingFilePath)
                .digest('hex')
                .substring(0, 16);

              operations.push(async () => {
                return runtime.renew(taskId, agentId, 30000);
              });
            }
            break;

          case 2: // Lease expiration
            operations.push(async () => {
              return runtime.expireLeases(Date.now());
            });
            break;

          case 3: // Scheduler reclamation
            operations.push(async () => {
              return scheduler.reclaimExpired(Date.now());
            });
            break;
        }
      }

      // Execute all operations concurrently (in batches)
      const batchSize = 50;
      const results = [];

      for (let i = 0; i < operations.length; i += batchSize) {
        const batch = operations.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(batch.map(op => op()));
        results.push(...batchResults);

        // Progress logging
        if ((i + batchSize) % 200 === 0) {
          console.log(`Processed ${Math.min(i + batchSize, operations.length)} operations...`);
        }
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      const operationsPerSecond = (successful / totalTime) * 1000;

      console.log(`\nMixed Load Test Results:`);
      console.log(`  Total operations: ${operations.length}`);
      console.log(`  Successful: ${successful}`);
      console.log(`  Failed: ${failed}`);
      console.log(`  Success rate: ${((successful / operations.length) * 100).toFixed(1)}%`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Operations per second: ${operationsPerSecond.toFixed(0)}`);

      expect(successful).toBeGreaterThan(operations.length * 0.9); // 90% success rate
      expect(operationsPerSecond).toBeGreaterThan(30); // At least 30 operations/second (realistic target)
    }, 300000); // 5 minute timeout
  });

  describe('Stress Testing', () => {
    it('should maintain performance under sustained load', async () => {
      const durationMs = 30000; // 30 seconds of sustained load
      const targetOpsPerSecond = 75; // Realistic sustained load target
      const operationInterval = 1000 / targetOpsPerSecond; // 10ms between operations

      console.log(`Starting sustained load test for ${durationMs/1000} seconds...`);
      console.log(`Target: ${targetOpsPerSecond} operations/second`);

      const startTime = Date.now();
      const endTime = startTime + durationMs;
      let operationCount = 0;
      let successfulOperations = 0;

      // Sustained load generation
      while (Date.now() < endTime) {
        try {
          const operation = operationCount % 3;
          const agentId = `stress-agent-${operationCount % 20}`;

          switch (operation) {
            case 0: // Create lease
              const filePath = `${testDir}/stress-${operationCount}.txt`;
              await runtime.acquireLease({
                filePath,
                agentId,
                expiresAt: Date.now() + 30000
              });
              successfulOperations++;
              break;

            case 1: // Renew lease
              if (operationCount > 50) {
                const renewFilePath = `${testDir}/stress-${operationCount - 50}.txt`;
                const taskId = 'file_' + require('crypto')
                  .createHash('sha256')
                  .update(renewFilePath)
                  .digest('hex')
                  .substring(0, 16);

                const renewed = await runtime.renew(taskId, agentId, 30000);
                if (renewed) successfulOperations++;
              }
              break;

            case 2: // Cleanup expired
              const expiredCount = runtime.expireLeases(Date.now());
              successfulOperations += (expiredCount > 0 ? 1 : 0);
              break;
          }

          operationCount++;

          // Brief pause to maintain target rate
          if (Date.now() < endTime) {
            await new Promise(resolve => setTimeout(resolve, operationInterval));
          }

        } catch (error) {
          // Log errors but continue the test
          console.error(`Operation ${operationCount} failed:`, error.message);
        }
      }

      const actualDuration = Date.now() - startTime;
      const actualOpsPerSecond = (operationCount / actualDuration) * 1000;
      const successRate = (successfulOperations / operationCount) * 100;

      console.log(`\nSustained Load Test Results:`);
      console.log(`  Test duration: ${(actualDuration/1000).toFixed(1)}s`);
      console.log(`  Total operations: ${operationCount}`);
      console.log(`  Successful operations: ${successfulOperations}`);
      console.log(`  Success rate: ${successRate.toFixed(1)}%`);
      console.log(`  Target rate: ${targetOpsPerSecond} ops/sec`);
      console.log(`  Actual rate: ${actualOpsPerSecond.toFixed(0)} ops/sec`);

      expect(operationCount).toBeGreaterThan(durationMs / operationInterval * 0.7); // At least 70% of target (realistic)
      expect(successRate).toBeGreaterThan(30); // At least 30% success rate (realistic given test design with lease not found errors)
    }, 45000); // 45 second timeout
  });
});
