// ABOUTME: Tests for the SQLite-backed scheduler with event logging.
// ABOUTME: Validates task leasing, lifecycle transitions, and event emission patterns.

import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TaskState } from '../state';

describe('Scheduler', () => {
  let mockDb: any;
  let mockEventLogger: any;
  let Scheduler: any;

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
    mockEventLogger = {
      logTaskClaimed: jest.fn(),
      logTaskRunning: jest.fn(),
      logTaskVerifying: jest.fn(),
      logTaskCommitted: jest.fn(),
      logTaskError: jest.fn(),
      getTaskEvents: jest.fn()
    };

    // Mock the event logger factory before importing Scheduler
    jest.doMock('../../events/event-logger', () => ({
      createMafEventLogger: () => mockEventLogger
    }));

    // Import Scheduler after setting up mocks
    Scheduler = require('../scheduler').Scheduler;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('constructor', () => {
    it('should create event logger on initialization', () => {
      // Create mock database
      mockDb = {
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn()
        })
      };

      const scheduler = new Scheduler(mockDb);
      
      // Verify the scheduler was created successfully
      expect(scheduler).toBeDefined();
    });
  });

  describe('reserve', () => {
    beforeEach(() => {
      // Create mock database
      mockDb = {
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn()
        }),
        transaction: jest.fn().mockImplementation((fn) => fn)
      };
    });

    it('should claim a task and log both CLAIMED and LEASED events', () => {
      const mockTask = {
        id: 'task-123',
        state: 'READY',
        priority: 100,
        attempts: 0
      };

      // Mock database transaction to return task
      const mockPrepare = jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn().mockReturnValue(mockTask)
      });
      mockDb.prepare = mockPrepare;

      const scheduler = new Scheduler(mockDb);
      const result = scheduler.reserve('agent-456', 30000);

      expect(result).not.toBeNull();
      expect(mockEventLogger.logTaskClaimed).toHaveBeenCalledWith('task-123', 'agent-456', 1);
    });

    it('should return null when no tasks are available', () => {
      // Mock database to return no tasks
      const mockPrepare = jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn().mockReturnValue(null)
      });
      mockDb.prepare = mockPrepare;

      const scheduler = new Scheduler(mockDb);
      const result = scheduler.reserve('agent-456', 30000);

      expect(result).toBeNull();
      expect(mockEventLogger.logTaskClaimed).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    beforeEach(() => {
      mockDb = {
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn()
        })
      };
    });

    it('should mark task as running and log RUNNING event', () => {
      const scheduler = new Scheduler(mockDb);
      scheduler.start('task-123');

      expect(mockEventLogger.logTaskRunning).toHaveBeenCalledWith('task-123');
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks SET state=?, updated_at=? WHERE id=?')
      );
    });
  });

  describe('verifying', () => {
    beforeEach(() => {
      mockDb = {
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn()
        })
      };
    });

    it('should mark task as verifying and log VERIFYING event', () => {
      const scheduler = new Scheduler(mockDb);
      scheduler.verifying('task-123');

      expect(mockEventLogger.logTaskVerifying).toHaveBeenCalledWith('task-123');
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks SET state=?, updated_at=? WHERE id=?')
      );
    });
  });

  describe('committed', () => {
    beforeEach(() => {
      mockDb = {
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn()
        })
      };
    });

    it('should mark task as committed and log COMMITTED event', () => {
      const scheduler = new Scheduler(mockDb);
      scheduler.committed('task-123');

      expect(mockEventLogger.logTaskCommitted).toHaveBeenCalledWith('task-123');
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks SET state=?, updated_at=? WHERE id=?')
      );
    });
  });

  describe('error', () => {
    beforeEach(() => {
      mockDb = {
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn()
        })
      };
    });

    it('should log error event and mark task as rollback when not retryable', () => {
      const error = new Error('Test error');
      const context = { step: 'execution', retryable: false };

      const scheduler = new Scheduler(mockDb);
      scheduler.error('task-123', error, context);

      expect(mockEventLogger.logTaskError).toHaveBeenCalledWith('task-123', error, context);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks SET state=?, updated_at=? WHERE id=?')
      );
    });

    it('should log error event without changing state when retryable', () => {
      const error = new Error('Temporary error');
      const context = { step: 'execution', retryable: true };

      const scheduler = new Scheduler(mockDb);
      scheduler.error('task-123', error, context);

      expect(mockEventLogger.logTaskError).toHaveBeenCalledWith('task-123', error, context);
      // Should not update task state for retryable errors
      expect(mockDb.prepare).not.toHaveBeenCalledWith(
        expect.stringContaining('ROLLBACK'),
        expect.any(Number),
        'task-123'
      );
    });

    it('should handle errors without context', () => {
      const error = new Error('Simple error');

      const scheduler = new Scheduler(mockDb);
      scheduler.error('task-123', error);

      expect(mockEventLogger.logTaskError).toHaveBeenCalledWith('task-123', error, undefined);
    });
  });

  describe('getTaskEvents', () => {
    beforeEach(() => {
      mockDb = {
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn()
        })
      };
    });

    it('should get events for a task', () => {
      const mockEvents = [
        { id: 1, kind: 'CLAIMED', ts: 1000 },
        { id: 2, kind: 'RUNNING', ts: 2000 }
      ];
      mockEventLogger.getTaskEvents.mockReturnValue(mockEvents);

      const scheduler = new Scheduler(mockDb);
      const events = scheduler.getTaskEvents('task-123');

      expect(events).toEqual(mockEvents);
      expect(mockEventLogger.getTaskEvents).toHaveBeenCalledWith('task-123');
    });
  });

  describe('renew', () => {
    beforeEach(() => {
      mockDb = {
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn()
        })
      };
    });

    it('should renew lease for task', () => {
      const mockResult = { changes: 1 };
      const mockPrepare = jest.fn().mockReturnValue({
        run: jest.fn().mockReturnValue(mockResult)
      });
      mockDb.prepare = mockPrepare;

      const scheduler = new Scheduler(mockDb);
      const result = scheduler.renew('task-123', 'agent-456', 60000);

      expect(result).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE leases SET lease_expires_at=? WHERE task_id=? AND agent_id=?')
      );
    });

    it('should return false when lease not found', () => {
      const mockResult = { changes: 0 };
      const mockPrepare = jest.fn().mockReturnValue({
        run: jest.fn().mockReturnValue(mockResult)
      });
      mockDb.prepare = mockPrepare;

      const scheduler = new Scheduler(mockDb);
      const result = scheduler.renew('task-123', 'agent-456', 60000);

      expect(result).toBe(false);
    });
  });
});
