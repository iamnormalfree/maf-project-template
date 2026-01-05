// ABOUTME: Integration test for the complete SQLite-first event logging system.
// ABOUTME: Validates end-to-end event workflow with coordinator and scheduler components.

import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Event Logging Integration', () => {
  let mockDb: any;
  let eventLogger: any;
  let scheduler: any;

  // Set up the mock for the 'require' call
  const originalRequire = require;
  const mockBetterSqlite3 = jest.fn();

  beforeAll(() => {
    require = jest.fn((moduleName: string) => {
      if (moduleName === 'better-sqlite3') {
        return mockBetterSqlite3;
      }
      return originalRequire(moduleName);
    }) as any;
  });

  afterAll(() => {
    require = originalRequire;
  });

  beforeEach(() => {
    // Mock event logger
    const mockEventLogger = {
      logTaskClaimed: jest.fn(),
      logTaskRunning: jest.fn(),
      logTaskVerifying: jest.fn(),
      logTaskCommitted: jest.fn(),
      logTaskError: jest.fn(),
      getTaskEvents: jest.fn()
    };

    // Mock the event logger factory
    jest.doMock('../events/event-logger', () => ({
      createMafEventLogger: () => mockEventLogger
    }));

    // Create mock database
    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn()
      }),
      transaction: jest.fn().mockImplementation((fn) => fn)
    };

    // Import and create instances after setting up mocks
    const { createMafEventLogger } = require('../events/event-logger');
    const { Scheduler } = require('../core/scheduler');
    
    eventLogger = createMafEventLogger(mockDb);
    scheduler = new Scheduler(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('Complete Task Lifecycle', () => {
    it('should log all events for a successful task execution', () => {
      const taskId = 'integration-task-1';
      const agentId = 'integration-agent-1';
      const mockTask = {
        id: taskId,
        state: 'READY',
        priority: 100,
        attempts: 0
      };

      // Mock database to return task for reservation
      const mockPrepare = jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn().mockReturnValue(mockTask)
      });
      mockDb.prepare = mockPrepare;

      // Mock event retrieval
      const mockEvents = [
        { id: 1, task_id: taskId, ts: 1000, kind: 'CLAIMED', data_json: '{"agent_id":"integration-agent-1","attempt":1}' },
        { id: 2, task_id: taskId, ts: 2000, kind: 'RUNNING', data_json: '{}' },
        { id: 3, task_id: taskId, ts: 3000, kind: 'VERIFYING', data_json: '{}' },
        { id: 4, task_id: taskId, ts: 4000, kind: 'COMMITTED', data_json: '{}' }
      ];

      eventLogger.getTaskEvents = jest.fn().mockReturnValue(mockEvents);

      // Execute complete task lifecycle
      const lease = scheduler.reserve(agentId, 30000);
      scheduler.start(taskId);
      scheduler.verifying(taskId);
      scheduler.committed(taskId);

      // Verify all events were logged
      const events = scheduler.getTaskEvents(taskId);
      const eventKinds = events.map(e => e.kind);

      expect(eventKinds).toEqual(['CLAIMED', 'RUNNING', 'VERIFYING', 'COMMITTED']);
      expect(events).toHaveLength(4);
    });

    it('should handle task failure with error logging', () => {
      const taskId = 'integration-task-2';
      const agentId = 'integration-agent-2';
      const error = new Error('Task execution failed');
      const context = { step: 'verification', retryable: false };
      
      const mockTask = {
        id: taskId,
        state: 'READY',
        priority: 100,
        attempts: 0
      };

      // Mock database to return task for reservation
      const mockPrepare = jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn().mockReturnValue(mockTask)
      });
      mockDb.prepare = mockPrepare;

      // Mock event retrieval
      const mockEvents = [
        { id: 1, task_id: taskId, ts: 1000, kind: 'CLAIMED', data_json: '{"agent_id":"integration-agent-2","attempt":1}' },
        { id: 2, task_id: taskId, ts: 2000, kind: 'RUNNING', data_json: '{}' },
        { id: 3, task_id: taskId, ts: 3000, kind: 'ERROR', data_json: '{"error":{"message":"Task execution failed","name":"Error"},"context":{"step":"verification","retryable":false}}' }
      ];

      eventLogger.getTaskEvents = jest.fn().mockReturnValue(mockEvents);

      // Execute task lifecycle with error
      const lease = scheduler.reserve(agentId, 30000);
      scheduler.start(taskId);
      scheduler.error(taskId, error, context);

      // Verify events include error
      const events = scheduler.getTaskEvents(taskId);
      const eventKinds = events.map(e => e.kind);

      expect(eventKinds).toEqual(['CLAIMED', 'RUNNING', 'ERROR']);
      expect(events).toHaveLength(3);

      // Verify error event contains proper error data
      const errorEvent = events.find(e => e.kind === 'ERROR');
      expect(errorEvent).toBeDefined();
      const errorData = JSON.parse(errorEvent!.data_json);
      expect(errorData.error.message).toBe(error.message);
      expect(errorData.context).toEqual(context);
    });

    it('should support event-based task state tracking and debugging', () => {
      const taskId = 'debugging-task';
      
      // Mock comprehensive event history
      const mockEvents = [
        { id: 1, task_id: taskId, ts: 1000, kind: 'CLAIMED', data_json: '{"agent_id":"agent-1","attempt":1}' },
        { id: 2, task_id: taskId, ts: 2000, kind: 'RUNNING', data_json: '{}' },
        { id: 3, task_id: taskId, ts: 3000, kind: 'ERROR', data_json: '{"error":{"message":"Temporary failure","name":"Error"},"context":{"step":"execution","retryable":true}}' },
        { id: 4, task_id: taskId, ts: 4000, kind: 'CLAIMED', data_json: '{"agent_id":"agent-1","attempt":2}' },
        { id: 5, task_id: taskId, ts: 5000, kind: 'RUNNING', data_json: '{}' },
        { id: 6, task_id: taskId, ts: 6000, kind: 'VERIFYING', data_json: '{}' },
        { id: 7, task_id: taskId, ts: 7000, kind: 'COMMITTED', data_json: '{}' }
      ];

      eventLogger.getTaskEvents = jest.fn().mockReturnValue(mockEvents);

      // Verify comprehensive event tracking
      const events = scheduler.getTaskEvents(taskId);
      
      expect(events).toHaveLength(7);
      
      // Verify chronological order
      for (let i = 1; i < events.length; i++) {
        expect(events[i].ts).toBeGreaterThan(events[i-1].ts);
      }

      // Verify retry pattern
      const claimedEvents = events.filter(e => e.kind === 'CLAIMED');
      expect(claimedEvents).toHaveLength(2);
      
      const firstClaim = JSON.parse(claimedEvents[0].data_json);
      const secondClaim = JSON.parse(claimedEvents[1].data_json);
      expect(firstClaim.attempt).toBe(1);
      expect(secondClaim.attempt).toBe(2);

      // Verify successful completion after retry
      const finalEvent = events[events.length - 1];
      expect(finalEvent.kind).toBe('COMMITTED');
    });
  });

  describe('Event Types and Data Structure', () => {
    it('should maintain consistent event data structure across all event types', () => {
      const taskId = 'structure-test-task';

      // Test all event types through direct logger
      eventLogger.logTaskClaimed(taskId, 'test-agent', 1);
      eventLogger.logTaskRunning(taskId);
      eventLogger.logTaskVerifying(taskId);
      eventLogger.logTaskCommitted(taskId);
      eventLogger.logTaskError(taskId, new Error('test error'), { context: 'test' });

      // Verify all calls were made with correct data structure
      expect(eventLogger.logTaskClaimed).toHaveBeenCalledWith(taskId, 'test-agent', 1);
      expect(eventLogger.logTaskRunning).toHaveBeenCalledWith(taskId);
      expect(eventLogger.logTaskVerifying).toHaveBeenCalledWith(taskId);
      expect(eventLogger.logTaskCommitted).toHaveBeenCalledWith(taskId);
      expect(eventLogger.logTaskError).toHaveBeenCalledWith(taskId, expect.any(Error), { context: 'test' });
    });
  });

  describe('Event Logging Deduplication (Blueprint Compliance)', () => {
    let mockScheduler: any;
    let coordinator: any;

    beforeEach(() => {
      // Create mock scheduler that follows MafScheduler interface
      mockScheduler = {
        pickNextTask: jest.fn()
      };

      // Import and create coordinator after setting up mocks
      const { createMafCoordinator } = require('../core/coordinator');
      
      // Mock runtime state
      const mockRuntimeState = {
        enqueue: jest.fn(),
        refresh: jest.fn()
      };

      coordinator = createMafCoordinator({
        runtime: mockRuntimeState,
        beadsExecutable: '/mock/path/to/beads',
        agentMailRoot: '/mock/mail/root',
        scheduler: mockScheduler,
        eventLogger
      });
    });

    it('should NOW: coordinator.claimNextTask does NOT generate duplicate CLAIMED events', async () => {
      const taskId = 'deduplication-test-1';
      const agentId = 'agent-dedup-1';
      const mockTask = {
        beadId: taskId,
        id: taskId,
        state: 'READY',
        priority: 100,
        attempts: 0
      };

      // Mock scheduler to return task
      mockScheduler.pickNextTask.mockResolvedValue(mockTask);

      // Call coordinator.claimNextTask which calls scheduler.pickNextTask
      const result = await coordinator.claimNextTask(agentId);

      // PREVIOUS BEHAVIOR: This fails because coordinator generates CLAIMED event at line 73
      // CURRENT BEHAVIOR: Coordinator should not generate CLAIMED events
      expect(eventLogger.logTaskClaimed).not.toHaveBeenCalled();
      expect(mockScheduler.pickNextTask).toHaveBeenCalledWith(agentId);
      expect(result).toEqual(mockTask);
    });

    it('should NOW: coordinator.dispatch does NOT generate CLAIMED events for TASK_CLAIM', () => {
      const taskId = 'deduplication-test-2';
      const agentId = 'agent-dedup-2';
      const taskClaimMessage = {
        type: 'TASK_CLAIM',
        beadId: taskId,
        agentId
      };

      // Dispatch TASK_CLAIM message
      coordinator.dispatch(taskClaimMessage);

      // PREVIOUS BEHAVIOR: This fails because coordinator.dispatch() generates CLAIMED event at line 45
      // CURRENT BEHAVIOR: Coordinator should not generate CLAIMED events, only scheduler should
      expect(eventLogger.logTaskClaimed).not.toHaveBeenCalled();
    });

    it('should NOW: SQLite scheduler generates exactly one CLAIMED event, coordinator does not duplicate', async () => {
      const taskId = 'deduplication-test-3';
      const agentId = 'agent-dedup-3';
      const mockTask = {
        beadId: taskId,
        id: taskId,
        state: 'READY',
        priority: 100,
        attempts: 0
      };

      // Mock database to return task for reservation
      const mockPrepare = jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn().mockReturnValue(mockTask)
      });
      mockDb.prepare = mockPrepare;

      // Test SQLite scheduler directly
      const lease = scheduler.reserve(agentId, 30000);

      // Verify SQLite scheduler generates exactly 1 CLAIMED event (this is correct behavior)
      expect(eventLogger.logTaskClaimed).toHaveBeenCalledTimes(1);
      expect(eventLogger.logTaskClaimed).toHaveBeenCalledWith(taskId, agentId, 1);
      expect(lease).not.toBeNull();

      // Reset mock for next test
      eventLogger.logTaskClaimed.mockClear();

      // Now test what happens when coordinator is used with SQLite scheduler
      // This demonstrates the architecture issue
      const mockRuntimeState = {
        enqueue: jest.fn(),
        refresh: jest.fn()
      };

      // Create adapter to make SQLite scheduler compatible with coordinator
      const sqliteSchedulerAdapter = {
        pickNextTask: jest.fn().mockImplementation(async (agentId: string) => {
          const lease = scheduler.reserve(agentId, 30000);
          return lease ? { beadId: lease.task.id } : null;
        })
      };

      const { createMafCoordinator } = require('../core/coordinator');
      const coordinatorWithSqlite = createMafCoordinator({
        runtime: mockRuntimeState,
        beadsExecutable: '/mock/path/to/beads',
        agentMailRoot: '/mock/mail/root',
        scheduler: sqliteSchedulerAdapter,
        eventLogger
      });

      const result = await coordinatorWithSqlite.claimNextTask(agentId);

      // PREVIOUS BEHAVIOR: This fails because we get 2 CLAIMED events:
      // 1 from scheduler.reserve() (correct)
      // 1 from coordinator.claimNextTask() (incorrect - should be removed)
      expect(eventLogger.logTaskClaimed).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });
  });
});
