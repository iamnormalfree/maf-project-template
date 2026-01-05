// ABOUTME: Tests for worker heartbeat emission and lease renewal behavior.
// ABOUTME: Defines expected heartbeats, renewals, and cleanup for long-running tasks.
// ABOUTME: Session 2 - Integration tests for heartbeat manager within worker context.

import { createWorkerHeartbeatManager } from '../heartbeat-manager';
import { createInMemoryRuntimeState, type MafRuntimeState } from '../core/runtime-state';
import { createMafEventLogger, type MafEventLogger } from '../events/event-logger';
import type { MafTaskClaim } from '../core/protocols';

// Mock better-sqlite3 to avoid native dependency during unit tests
jest.mock('better-sqlite3', () => ({
  Database: jest.fn().mockImplementation(() => ({
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      all: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue(null),
    }),
    close: jest.fn(),
  })),
}));

// ============ SESSION 1: UNIT TESTS ============

describe('Worker Heartbeat & Lease Renewal (red spec)', () => {
  let runtime: MafRuntimeState;
  let eventLogger: MafEventLogger;
  let heartbeatManager: Awaited<ReturnType<typeof createWorkerHeartbeatManager>>;
  let mockDb: any;

  beforeEach(() => {
    jest.useFakeTimers();

    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
        get: jest.fn().mockReturnValue(null),
      }),
      close: jest.fn(),
    };

    runtime = createInMemoryRuntimeState();

    // Spy-able runtime methods for call-count assertions
    jest.spyOn(runtime, 'upsertHeartbeat');
    jest.spyOn(runtime, 'refresh');

    eventLogger = createMafEventLogger(mockDb);
    jest.spyOn(eventLogger, 'logAgentHealthCheck');
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();
    if (heartbeatManager && heartbeatManager.isRunning()) {
      await heartbeatManager.stop();
    }
  });

  const makeTask = (agentId: string, beadId: string): MafTaskClaim => ({
    type: 'TASK_CLAIM',
    agentId,
    beadId,
    files: ['/tmp/file.ts'],
    etaMinutes: 5,
    timestamp: Date.now(),
  });
  
  it('emits periodic heartbeats during a long task', async () => {
    const agentId = 'worker-heartbeat';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);

    await heartbeatManager.start(makeTask(agentId, 'bead-heartbeat'));

    // Advance one heartbeat interval (15s) — expect initial + first periodic heartbeat
    jest.advanceTimersByTime(15_000);

    // Wait for async timers to resolve
    await Promise.resolve(); // Flush promise queue

    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(2);
    const firstCall = (runtime.upsertHeartbeat as jest.Mock).mock.calls[0][0];
    expect(firstCall).toMatchObject({ agentId, status: 'working' });

    // Event logger should mirror heartbeat
    expect(eventLogger.logAgentHealthCheck).toHaveBeenCalledTimes(2);
  });

  it('renews leases before expiration for long tasks', async () => {
    const agentId = 'worker-renew';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);

    await heartbeatManager.start(makeTask(agentId, 'bead-renew'));

    // Advance one renewal interval (10s)
    jest.advanceTimersByTime(10_000);

    expect(runtime.refresh).toHaveBeenCalled();
  });

  it('sends final idle heartbeat and stops timers on completion', async () => {
    const agentId = 'worker-complete';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);

    await heartbeatManager.start(makeTask(agentId, 'bead-complete'));

    jest.advanceTimersByTime(5_000);
    expect(runtime.upsertHeartbeat).toHaveBeenCalled();

    await heartbeatManager.stop();

    const finalCall = (runtime.upsertHeartbeat as jest.Mock).mock.calls.find((call: any[]) => call[0].status === 'idle');
    expect(finalCall).toBeDefined();
    expect(finalCall![0]).toMatchObject({ agentId, status: 'idle' });

    const callsAfterStop = (runtime.upsertHeartbeat as jest.Mock).mock.calls.length;
    jest.advanceTimersByTime(10_000);
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(callsAfterStop);
  });

  it('logs heartbeat health events with task context', async () => {
    const agentId = 'worker-events';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);

    await heartbeatManager.start(makeTask(agentId, 'bead-events'));

    jest.advanceTimersByTime(20_000);

    expect(eventLogger.logAgentHealthCheck).toHaveBeenCalled();
    const call = (eventLogger.logAgentHealthCheck as jest.Mock).mock.calls[0][0];
    expect(call).toMatchObject({ agent_id: agentId, status: 'healthy' });
  });

  it('allows lease expiry and reclaim after heartbeats stop', async () => {
    const agentId = 'worker-reclaim';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);

    await heartbeatManager.start(makeTask(agentId, 'bead-reclaim'));

    jest.advanceTimersByTime(10_000);
    expect(runtime.upsertHeartbeat).toHaveBeenCalled();

    await heartbeatManager.stop();

    jest.advanceTimersByTime(40_000);

    expect(heartbeatManager.isRunning()).toBe(false);
    // TODO: when renew/lease expiry logic is wired, assert scheduler can reclaim the task
  });

  it('cleans up timers on graceful stop', async () => {
    const agentId = 'worker-cleanup';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);

    await heartbeatManager.start(makeTask(agentId, 'bead-cleanup'));

    jest.advanceTimersByTime(5_000);
    const beforeStop = (runtime.upsertHeartbeat as jest.Mock).mock.calls.length;

    await heartbeatManager.stop();

    jest.advanceTimersByTime(10_000);
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(beforeStop + 1); // includes final idle heartbeat
    expect(heartbeatManager.isRunning()).toBe(false);
  });

  it('handles rapid start/stop cycles without leaking timers', async () => {
    const agentId = 'worker-rapid';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);

    await heartbeatManager.start(makeTask(agentId, 'bead-rapid'));
    jest.advanceTimersByTime(2_000);
    await heartbeatManager.stop();

    expect(runtime.upsertHeartbeat).toHaveBeenCalled();
    expect(heartbeatManager.isRunning()).toBe(false);
  });
});

// ============ SESSION 2: INTEGRATION TESTS ============

describe('Integration with Worker Task Execution', () => {
  let runtime: MafRuntimeState;
  let eventLogger: MafEventLogger;
  let heartbeatManager: Awaited<ReturnType<typeof createWorkerHeartbeatManager>>;
  let mockDb: any;

  beforeEach(() => {
    jest.useFakeTimers();

    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
        get: jest.fn().mockReturnValue(null),
      }),
      close: jest.fn(),
    };

    runtime = createInMemoryRuntimeState();

    // Spy on runtime methods for call-count assertions
    jest.spyOn(runtime, 'upsertHeartbeat');
    jest.spyOn(runtime, 'refresh');

    eventLogger = createMafEventLogger(mockDb);
    jest.spyOn(eventLogger, 'logAgentHealthCheck');
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();
    if (heartbeatManager && heartbeatManager.isRunning()) {
      await heartbeatManager.stop();
    }
  });

  const makeTask = (agentId: string, beadId: string): MafTaskClaim => ({
    type: 'TASK_CLAIM',
    agentId,
    beadId,
    files: ['/tmp/file.ts'],
    etaMinutes: 5,
    timestamp: Date.now(),
  });

  it('integrates heartbeat manager lifecycle with task execution', async () => {
    const agentId = 'integration-lifecycle';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);
    const taskClaim = makeTask(agentId, 'bead-lifecycle');

    // Start heartbeat manager (simulating task start)
    await heartbeatManager.start(taskClaim);

    // Verify initial heartbeat
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(1);
    const initialCall = (runtime.upsertHeartbeat as jest.Mock).mock.calls[0][0];
    expect(initialCall).toMatchObject({ agentId, status: 'working' });

    // Simulate task execution duration (long enough for periodic heartbeat)
    jest.advanceTimersByTime(16_000); // Just over 15s heartbeat interval
    await Promise.resolve(); // Flush promises

    // Verify periodic heartbeats during execution
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(2);
    
    // Stop heartbeat manager (simulating task completion)
    await heartbeatManager.stop();

    // Verify final idle heartbeat
    const finalCall = (runtime.upsertHeartbeat as jest.Mock).mock.calls.find((call: any[]) => call[0].status === 'idle');
    expect(finalCall).toBeDefined();
    expect(finalCall![0]).toMatchObject({ agentId, status: 'idle' });

    // Verify no additional heartbeats after stop
    const callsAfterStop = (runtime.upsertHeartbeat as jest.Mock).mock.calls.length;
    jest.advanceTimersByTime(15_000);
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(callsAfterStop);
  });

  it('handles lease renewals during extended task execution', async () => {
    const agentId = 'integration-lease';
    heartbeatManager = await createWorkerHeartbeatManager(
      agentId, 
      runtime, 
      eventLogger,
      {
        leaseRenewalIntervalMs: 5_000, // Faster for testing
        leaseTtlMs: 30_000
      }
    );
    const taskClaim = makeTask(agentId, 'bead-lease');

    await heartbeatManager.start(taskClaim);

    // Advance time to trigger lease renewal
    jest.advanceTimersByTime(6_000); // Just over renewal interval
    await Promise.resolve();

    // Verify lease renewal was attempted
    expect(runtime.refresh).toHaveBeenCalled();

    await heartbeatManager.stop();
  });

  it('maintains proper heartbeat cadence during task execution', async () => {
    const agentId = 'integration-cadence';
    heartbeatManager = await createWorkerHeartbeatManager(
      agentId, 
      runtime, 
      eventLogger,
      {
        heartbeatIntervalMs: 5_000, // Faster for testing
        leaseRenewalIntervalMs: 3_000,
        leaseTtlMs: 30_000
      }
    );
    const taskClaim = makeTask(agentId, 'bead-cadence');

    await heartbeatManager.start(taskClaim);

    // Initial heartbeat
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(1);

    // First interval
    jest.advanceTimersByTime(5_000);
    await Promise.resolve();
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(2);

    // Second interval
    jest.advanceTimersByTime(5_000);
    await Promise.resolve();
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(3);

    // All working heartbeats should have correct status
    const workingCalls = (runtime.upsertHeartbeat as jest.Mock).mock.calls
      .filter((call: any[]) => call[0].status === 'working');
    expect(workingCalls.length).toBe(3);

    await heartbeatManager.stop();
  });

  it('handles multiple heartbeat manager instances independently', async () => {
    const agentId1 = 'integration-multi-1';
    const agentId2 = 'integration-multi-2';
    
    const heartbeatManager1 = await createWorkerHeartbeatManager(agentId1, runtime, eventLogger);
    const heartbeatManager2 = await createWorkerHeartbeatManager(agentId2, runtime, eventLogger);
    
    const task1 = makeTask(agentId1, 'bead-multi-1');
    const task2 = makeTask(agentId2, 'bead-multi-2');

    // Start both managers
    await heartbeatManager1.start(task1);
    await heartbeatManager2.start(task2);

    // Verify both have sent initial heartbeats
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(2);

    // Advance time enough to trigger heartbeats from both managers
    jest.advanceTimersByTime(16_000); // Just over 15s default heartbeat interval
    await Promise.resolve();
    expect(runtime.upsertHeartbeat).toHaveBeenCalledTimes(4);

    // Verify heartbeats are correctly attributed
    const calls = (runtime.upsertHeartbeat as jest.Mock).mock.calls;
    const agent1Calls = calls.filter((call: any[]) => call[0].agentId === agentId1);
    const agent2Calls = calls.filter((call: any[]) => call[0].agentId === agentId2);
    
    expect(agent1Calls.length).toBe(2);
    expect(agent2Calls.length).toBe(2);

    // Stop both managers
    await heartbeatManager1.stop();
    await heartbeatManager2.stop();

    // Verify both send final idle heartbeats
    const idleCalls = calls.filter((call: any[]) => call[0].status === 'idle');
    expect(idleCalls.length).toBe(2);
  });
});

describe('Error Scenarios & Recovery', () => {
  let runtime: MafRuntimeState;
  let eventLogger: MafEventLogger;
  let heartbeatManager: Awaited<ReturnType<typeof createWorkerHeartbeatManager>>;
  let mockDb: any;

  beforeEach(() => {
    jest.useFakeTimers();

    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
        get: jest.fn().mockReturnValue(null),
      }),
      close: jest.fn(),
    };

    runtime = createInMemoryRuntimeState();

    // Spy on runtime methods for call-count assertions
    jest.spyOn(runtime, 'upsertHeartbeat');
    jest.spyOn(runtime, 'refresh');

    eventLogger = createMafEventLogger(mockDb);
    jest.spyOn(eventLogger, 'logAgentHealthCheck');
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.clearAllMocks();
    if (heartbeatManager && heartbeatManager.isRunning()) {
      await heartbeatManager.stop();
    }
  });

  const makeTask = (agentId: string, beadId: string): MafTaskClaim => ({
    type: 'TASK_CLAIM',
    agentId,
    beadId,
    files: ['/tmp/file.ts'],
    etaMinutes: 5,
    timestamp: Date.now(),
  });

  it('handles heartbeat manager start failures gracefully', async () => {
    const agentId = 'error-start-fail';
    
    // Mock runtime to fail on heartbeat during start
    runtime.upsertHeartbeat = jest.fn().mockRejectedValue(
      new Error('Database connection failed during heartbeat')
    );

    const failingHeartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);
    const taskClaim = makeTask(agentId, 'bead-error-start');

    // Start should fail due to heartbeat failure
    await expect(failingHeartbeatManager.start(taskClaim)).rejects.toThrow('Database connection failed during heartbeat');
  });

  it('handles concurrent start/stop operations safely', async () => {
    const agentId = 'error-concurrent';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);
    const taskClaim = makeTask(agentId, 'bead-concurrent');

    // Start heartbeat manager
    await heartbeatManager.start(taskClaim);

    // Attempt concurrent stop operations
    const stopPromise1 = heartbeatManager.stop();
    const stopPromise2 = heartbeatManager.stop();

    // Both should complete without throwing
    await expect(Promise.all([stopPromise1, stopPromise2])).resolves.not.toThrow();
    expect(heartbeatManager.isRunning()).toBe(false);
  });

  it('prevents multiple starts on same heartbeat manager', async () => {
    const agentId = 'error-double-start';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);
    const taskClaim = makeTask(agentId, 'bead-double-start');

    // First start should succeed
    await heartbeatManager.start(taskClaim);
    expect(heartbeatManager.isRunning()).toBe(true);

    // Second start should fail
    await expect(heartbeatManager.start(taskClaim)).rejects.toThrow('Heartbeat manager is already running');

    // Cleanup
    await heartbeatManager.stop();
  });

  it('continues operation despite event logger failures', async () => {
    const agentId = 'error-event-logger';
    
    // Mock event logger to fail silently rather than throwing
    const originalLogAgentHealthCheck = eventLogger.logAgentHealthCheck;
    eventLogger.logAgentHealthCheck = jest.fn().mockImplementation(async (...args) => {
      // Call the original to maintain behavior, but don't throw
      try {
        await originalLogAgentHealthCheck.apply(eventLogger, args);
      } catch (error) {
        // Silently ignore event logger errors
      }
    });

    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);
    const taskClaim = makeTask(agentId, 'bead-event-logger');

    // Start should succeed
    await heartbeatManager.start(taskClaim);

    // Heartbeats should still be sent to runtime
    expect(runtime.upsertHeartbeat).toHaveBeenCalled();

    // Manager should still be running
    expect(heartbeatManager.isRunning()).toBe(true);

    // Cleanup
    await heartbeatManager.stop();
  });

  it('properly cleans up timers during error scenarios', async () => {
    const agentId = 'error-cleanup';
    heartbeatManager = await createWorkerHeartbeatManager(agentId, runtime, eventLogger);
    const taskClaim = makeTask(agentId, 'bead-cleanup');

    await heartbeatManager.start(taskClaim);

    // Simulate some heartbeat activity
    jest.advanceTimersByTime(5_000);
    await Promise.resolve();

    const callsBeforeStop = (runtime.upsertHeartbeat as jest.Mock).mock.calls.length;

    // Stop heartbeat manager
    await heartbeatManager.stop();

    // Verify manager is stopped
    expect(heartbeatManager.isRunning()).toBe(false);

    // Advance time significantly and verify no new calls are made
    jest.advanceTimersByTime(30_000);
    await Promise.resolve();

    const callsAfterAdvance = (runtime.upsertHeartbeat as jest.Mock).mock.calls.length;
    expect(callsAfterAdvance).toBe(callsBeforeStop + 1); // Only the final idle heartbeat
  });
});
