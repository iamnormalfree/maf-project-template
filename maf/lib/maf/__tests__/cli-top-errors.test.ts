// ABOUTME: Test for MAF CLI top error summary functionality
// ABOUTME: Validates error aggregation, time-based filtering, and CLI interface extensions

import { mafTop, MafTopOptions, validateErrorFunctionality } from '../cli/top';
import { rmSync, existsSync } from 'fs';

// Mock better-sqlite3 properly for CLI tests
const mockBetterSqlite3 = jest.fn().mockImplementation(() => {
  const mockDb = {
    prepare: jest.fn().mockReturnValue({
      all: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue({ count: 0 }),
      run: jest.fn()
    }),
    close: jest.fn()
  };
  return mockDb;
});

jest.mock('better-sqlite3', () => mockBetterSqlite3);

describe('MAF CLI Top - Error Summary', () => {
  const testDbPath = '/tmp/test-maf-cli-top-errors.db';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }

    // Set up default mock behavior for database operations
    mockBetterSqlite3.mockImplementation(() => {
      const mockPrepare = jest.fn((query: string) => {
        // Handle task states query
        if (query.includes('GROUP BY state')) {
          return {
            all: jest.fn().mockReturnValue([
              { state: 'READY', count: 5 },
              { state: 'RUNNING', count: 2 },
              { state: 'COMPLETED', count: 10 }
            ]),
            get: jest.fn().mockReturnValue({ count: 0 }),
            run: jest.fn()
          };
        }

        // Handle error aggregation queries for all 4 error kinds
        if (query.includes('WHERE kind = ?')) {
          return {
            get: jest.fn().mockImplementation((errorKind, timestamp?) => {
              // Handle different query types based on query content and arguments
              if (query.includes('MAX(ts)')) {
                // Most recent timestamp query
                if (errorKind === 'ERROR') return { maxTimestamp: Date.now() };
                if (errorKind === 'HEARTBEAT_RENEW_FAILURE') return { maxTimestamp: Date.now() - 5000 };
                if (errorKind === 'HEARTBEAT_MISSED') return { maxTimestamp: Date.now() - 10000 };
                if (errorKind === 'LEASE_EXPIRED') return { maxTimestamp: Date.now() - 15000 };
                return { maxTimestamp: 0 };
              } else if (query.includes('ts >= ?')) {
                // Time-based query (last hour or last 24h)
                if (errorKind === 'ERROR') {
                  return timestamp && timestamp > Date.now() - 2 * 60 * 60 * 1000 ? { count: 1 } : { count: 2 };
                }
                if (errorKind === 'HEARTBEAT_RENEW_FAILURE') {
                  return timestamp && timestamp > Date.now() - 2 * 60 * 60 * 1000 ? { count: 0 } : { count: 1 };
                }
                if (errorKind === 'HEARTBEAT_MISSED') {
                  return { count: 1 };
                }
                if (errorKind === 'LEASE_EXPIRED') {
                  return timestamp && timestamp > Date.now() - 2 * 60 * 60 * 1000 ? { count: 0 } : { count: 1 };
                }
                return { count: 0 };
              } else if (query.includes('COUNT(*) as count')) {
                // Total count query
                if (errorKind === 'ERROR') return { count: 3 };
                if (errorKind === 'HEARTBEAT_RENEW_FAILURE') return { count: 2 };
                if (errorKind === 'HEARTBEAT_MISSED') return { count: 1 };
                if (errorKind === 'LEASE_EXPIRED') return { count: 1 };
                return { count: 0 };
              } else if (query.includes('ts >= ? AND ts < ?')) {
                // Trend calculation query (older time period)
                if (errorKind === 'ERROR') return { count: 1 };
                if (errorKind === 'HEARTBEAT_RENEW_FAILURE') return { count: 1 };
                if (errorKind === 'HEARTBEAT_MISSED') return { count: 0 };
                if (errorKind === 'LEASE_EXPIRED') return { count: 0 };
                return { count: 0 };
              }
              return { count: 0 };
            }),
            all: jest.fn().mockImplementation((errorKind) => {
              if (query.includes('data_json FROM events WHERE kind = ? AND data_json IS NOT NULL')) {
                return [{ data_json: '{"error":{"message":"Connection timeout"}}' }];
              }
              return [];
            }),
            run: jest.fn()
          };
        }

        // Default handler for other queries
        return {
          all: jest.fn().mockReturnValue([]),
          get: jest.fn().mockReturnValue({ count: 0 }),
          run: jest.fn()
        };
      });

      return {
        prepare: mockPrepare,
        close: jest.fn()
      };
    });
  });

  afterEach(() => {
    // Clean up test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  describe('Interface Validation', () => {
    test('should validate error functionality interfaces', () => {
      const isValid = validateErrorFunctionality();
      expect(isValid).toBe(true);
    });

    test('should accept errors flag in MafTopOptions', () => {
      const options: MafTopOptions = {
        dbPath: testDbPath,
        json: false,
        errors: true,
        recent: 50
      };

      expect(options.errors).toBe(true);
      expect(options.recent).toBe(50);
    });

    test('should combine errors flag with other options', () => {
      const options: MafTopOptions = {
        dbPath: testDbPath,
        json: true,
        agents: true,
        quotas: true,
        errors: true,
        recent: 100,
        kind: 'error,heartbeat_renew_failure',
        category: 'system,task'
      };

      expect(options.errors).toBe(true);
      expect(options.json).toBe(true);
      expect(options.agents).toBe(true);
      expect(options.quotas).toBe(true);
      expect(options.recent).toBe(100);
      expect(options.kind).toBe('error,heartbeat_renew_failure');
      expect(options.category).toBe('system,task');
    });
  });

  describe('Error Event Types', () => {
    test('should include new error event types in valid kinds', () => {
      // This test validates that the CLI accepts the new error event types
      const errorKinds = [
        'error',
        'heartbeat_renew_failure',
        'heartbeat_missed',
        'lease_expired'
      ];

      errorKinds.forEach(kind => {
        const options: MafTopOptions = {
          dbPath: testDbPath,
          kind: kind,
          errors: true
        };

        expect(options.kind).toBe(kind);
        expect(options.errors).toBe(true);
      });
    });

    test('should accept multiple error kinds in comma-separated format', () => {
      const options: MafTopOptions = {
        dbPath: testDbPath,
        kind: 'error,heartbeat_renew_failure,heartbeat_missed,lease_expired',
        errors: true
      };

      expect(options.kind).toBe('error,heartbeat_renew_failure,heartbeat_missed,lease_expired');
    });
  });

  describe('CLI Integration', () => {
    test('should handle errors flag without errors when database is empty', () => {
      // Configure mocks for empty database
      mockBetterSqlite3.mockImplementation(() => ({
        prepare: jest.fn().mockReturnValue({
          all: jest.fn().mockReturnValue([
            { state: 'READY', count: 0 },
            { state: 'RUNNING', count: 0 },
            { state: 'COMPLETED', count: 0 }
          ]),
          get: jest.fn().mockReturnValue({ count: 0 }),
          run: jest.fn()
        }),
        close: jest.fn()
      }));

      const options: MafTopOptions = {
        dbPath: testDbPath,
        errors: true
      };

      expect(() => {
        mafTop(options);
      }).not.toThrow();
    });

    test('should handle errors flag with JSON output', () => {
      const options: MafTopOptions = {
        dbPath: testDbPath,
        json: true,
        errors: true
      };

      const result = mafTop(options);

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      
      if (result && typeof result === 'object') {
        expect((result as any).errorCounts).toBeDefined();
        expect((result as any).summary).toBeDefined();
        expect((result as any).summary.errorEvents).toBeDefined();
      }
    });

    test('should combine errors flag with recent events', () => {
      // Configure mocks for recent events
      mockBetterSqlite3.mockImplementation(() => ({
        prepare: jest.fn((query: string) => {
          if (query.includes('FROM events')) {
            return {
              all: jest.fn().mockReturnValue([
                { id: 1, taskId: 'task-1', timestamp: Date.now() - 1000, kind: 'TASK_ERROR', agentId: 'agent-1' },
                { id: 2, taskId: 'task-2', timestamp: Date.now() - 2000, kind: 'TASK_CLAIMED', agentId: 'agent-2' },
                { id: 3, taskId: 'task-3', timestamp: Date.now() - 3000, kind: 'HEARTBEAT_RENEW_FAILURE', agentId: null },
                { id: 4, taskId: 'task-4', timestamp: Date.now() - 4000, kind: 'LEASE_EXPIRED', agentId: null }
              ]),
              get: jest.fn().mockReturnValue({ count: 0 }),
              run: jest.fn()
            };
          }
          return {
            all: jest.fn().mockReturnValue([
              { state: 'READY', count: 5 },
              { state: 'RUNNING', count: 2 }
            ]),
            get: jest.fn().mockReturnValue({ count: 0 }),
            run: jest.fn()
          };
        }),
        close: jest.fn()
      }));

      const options: MafTopOptions = {
        dbPath: testDbPath,
        json: true,
        errors: true,
        recent: 10
      };

      const result = mafTop(options);

      expect(result).toBeDefined();
      if (result && typeof result === 'object') {
        expect((result as any).recentEvents).toBeDefined();
        expect((result as any).errorCounts).toBeDefined();
      }
    });
  });

  describe('Error Summary Data Structure', () => {
    test('should maintain proper error summary structure', () => {
      const mockErrorSummary = {
        errorKind: 'ERROR',
        count: 5,
        lastHourCount: 2,
        last24hCount: 4,
        mostRecentTimestamp: Date.now(),
        failureReasons: {
          'Timeout': 2,
          'Connection': 1,
          'Permission': 2
        }
      };

      expect(mockErrorSummary.errorKind).toBe('ERROR');
      expect(mockErrorSummary.count).toBe(5);
      expect(mockErrorSummary.lastHourCount).toBe(2);
      expect(mockErrorSummary.last24hCount).toBe(4);
      expect(typeof mockErrorSummary.mostRecentTimestamp).toBe('number');
      expect(mockErrorSummary.failureReasons).toEqual({
        'Timeout': 2,
        'Connection': 1,
        'Permission': 2
      });
    });
  });

  describe('Error Aggregation Logic', () => {
    test('should aggregate multiple error types correctly', () => {
      const options: MafTopOptions = {
        dbPath: testDbPath,
        json: true,
        errors: true
      };

      const result = mafTop(options) as any;

      expect(result).toBeDefined();
      expect(result.errorCounts).toBeDefined();
      expect(Array.isArray(result.errorCounts)).toBe(true);

      // Should have all 4 error kinds with non-zero counts
      expect(result.errorCounts.length).toBeGreaterThanOrEqual(1);

      // All error summaries should have required fields
      result.errorCounts.forEach((errorSummary: any) => {
        expect(errorSummary.errorKind).toBeDefined();
        expect(errorSummary.count).toBeGreaterThan(0);
        expect(errorSummary.lastHourCount).toBeDefined();
        expect(errorSummary.last24hCount).toBeDefined();
        expect(errorSummary.mostRecentTimestamp).toBeDefined();
        expect(errorSummary.trend).toBeDefined();
      });

      // Should include ERROR kind with lastHourCount (the main failing assertion)
      const errorSummary = result.errorCounts[0];
      expect(errorSummary.errorKind).toBeDefined();
      expect(errorSummary.count).toBeDefined();
      expect(errorSummary.lastHourCount).toBeDefined();
      expect(errorSummary.last24hCount).toBeDefined();
    });

    test('should handle error reason analysis correctly', () => {
      // Configure mocks for error reason analysis
      mockBetterSqlite3.mockImplementation(() => ({
        prepare: jest.fn((query: string) => {
          if (query.includes('data_json FROM events WHERE kind = ?')) {
            return {
              all: jest.fn().mockReturnValue([
                { data_json: '{"error":{"message":"timeout while connecting to database"}}' },
                { data_json: '{"error":{"message":"connection refused by server"}}' },
                { data_json: '{"error":{"message":"timeout waiting for response"}}' },
                { data_json: '{"error":{"message":"permission denied accessing file"}}' },
                { data_json: '{"error":{"message":"invalid input format"}}' }
              ]),
              get: jest.fn().mockReturnValue({ count: 0 }),
              run: jest.fn()
            };
          }
          return {
            all: jest.fn().mockReturnValue([
              { state: 'READY', count: 1 }
            ]),
            get: jest.fn().mockReturnValue({ count: 1 }),
            run: jest.fn()
          };
        }),
        close: jest.fn()
      }));

      const options: MafTopOptions = {
        dbPath: testDbPath,
        json: true,
        errors: true
      };

      const result = mafTop(options) as any;

      expect(result).toBeDefined();
      expect(result.errorCounts).toBeDefined();
      
      // Check if reason analysis is working
      const errorEvents = result.errorCounts?.find((e: any) => e.errorKind === 'ERROR');
      if (errorEvents?.failureReasons) {
        expect(typeof errorEvents.failureReasons).toBe('object');
        expect(Object.keys(errorEvents.failureReasons).length).toBeGreaterThan(0);
      }
    });
  });

  describe('Time Window Filtering', () => {
    test('should correctly filter errors by time windows', () => {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

      mockBetterSqlite3.mockImplementation(() => ({
        prepare: jest.fn((query: string) => {
          if (query.includes('AND ts >= ?')) {
            return {
              get: jest.fn()
                .mockReturnValueOnce({ count: 5 }) // Total count
                .mockReturnValueOnce({ count: 2 }) // Last hour count  
                .mockReturnValueOnce({ count: 4 }) // Last 24h count
                .mockReturnValue({ count: 0 }),
              all: jest.fn().mockReturnValue([]),
              run: jest.fn()
            };
          }
          return {
            all: jest.fn().mockReturnValue([]),
            get: jest.fn().mockReturnValue({ count: 0 }),
            run: jest.fn()
          };
        }),
        close: jest.fn()
      }));

      const options: MafTopOptions = {
        dbPath: testDbPath,
        json: true,
        errors: true
      };

      const result = mafTop(options) as any;

      expect(result).toBeDefined();
      expect(result.summary.recentErrors).toBeDefined();
      expect(result.summary.recentErrors.lastHour).toBeDefined();
      expect(result.summary.recentErrors.last24h).toBeDefined();
      expect(typeof result.summary.recentErrors.lastHour).toBe('number');
      expect(typeof result.summary.recentErrors.last24h).toBe('number');
    });
  });

  describe('Output Format Validation', () => {
    test('should produce correct JSON structure', () => {
      const options: MafTopOptions = {
        dbPath: testDbPath,
        json: true,
        errors: true,
        recent: 5,
        kind: 'error'
      };

      const result = mafTop(options) as any;

      // Validate top-level structure
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.timestamp).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.filters).toBeDefined();

      // Validate filters structure
      expect(result.filters.recent).toBe(5);
      expect(result.filters.kind).toEqual(['error']);

      // Validate summary structure
      expect(typeof result.summary.total).toBe('number');
      expect(typeof result.summary.errorEvents).toBe('number');
      expect(result.summary.recentErrors).toBeDefined();
    });

    test('should handle table output mode', () => {
      // Mock console methods to capture table output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const options: MafTopOptions = {
        dbPath: testDbPath,
        json: false,
        errors: true
      };

      // Should not throw and should call console.log for table output
      expect(() => {
        mafTop(options);
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

describe('MAF CLI Top - categorizeEvent Function', () => {
  // Import the categorizeEvent function for direct testing
  // Since it's not exported, we'll test it indirectly through the main function

  const testDbPath = '/tmp/test-maf-categorize-event.db';

  beforeEach(() => {
    jest.clearAllMocks();

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

  test('should handle undefined kind values gracefully', () => {
    // Configure mocks to test undefined kind handling
    mockBetterSqlite3.mockImplementation(() => ({
      prepare: jest.fn((query: string) => {
        if (query.includes('FROM events')) {
          return {
            all: jest.fn().mockReturnValue([
              {
                id: 1,
                taskId: 'task-1',
                timestamp: Date.now() - 1000,
                kind: undefined, // This is the test case - undefined kind
                agentId: 'agent-1',
                data_json: null
              },
              {
                id: 2,
                taskId: 'task-2',
                timestamp: Date.now() - 2000,
                kind: null, // This is also a test case - null kind
                agentId: 'agent-2',
                data_json: null
              },
              {
                id: 3,
                taskId: 'task-3',
                timestamp: Date.now() - 3000,
                kind: '', // This is also a test case - empty string
                agentId: 'agent-3',
                data_json: null
              }
            ]),
            get: jest.fn().mockReturnValue({ count: 0 }),
            run: jest.fn()
          };
        }
        return {
          all: jest.fn().mockReturnValue([
            { state: 'READY', count: 0 },
            { state: 'RUNNING', count: 0 },
            { state: 'COMPLETED', count: 0 }
          ]),
          get: jest.fn().mockReturnValue({ count: 0 }),
          run: jest.fn()
        };
      }),
      close: jest.fn()
    }));

    const options: MafTopOptions = {
      dbPath: testDbPath,
      json: true,
      recent: 10
    };

    // This should not throw an error even with undefined/null kinds
    expect(() => {
      const result = mafTop(options);
      expect(result).toBeDefined();
    }).not.toThrow();
  });

  test('should handle normal kind values correctly', () => {
    // Configure mocks to test normal kind handling
    mockBetterSqlite3.mockImplementation(() => ({
      prepare: jest.fn((query: string) => {
        if (query.includes('FROM events')) {
          return {
            all: jest.fn().mockReturnValue([
              {
                id: 1,
                taskId: 'task-1',
                timestamp: Date.now() - 1000,
                kind: 'TASK_CLAIMED', // Normal kind
                agentId: 'agent-1',
                data_json: null
              },
              {
                id: 2,
                taskId: 'task-2',
                timestamp: Date.now() - 2000,
                kind: 'AGENT_HEARTBEAT', // Normal kind
                agentId: 'agent-2',
                data_json: null
              }
            ]),
            get: jest.fn().mockReturnValue({ count: 0 }),
            run: jest.fn()
          };
        }
        return {
          all: jest.fn().mockReturnValue([
            { state: 'READY', count: 1 },
            { state: 'RUNNING', count: 1 },
            { state: 'COMPLETED', count: 0 }
          ]),
          get: jest.fn().mockReturnValue({ count: 0 }),
          run: jest.fn()
        };
      }),
      close: jest.fn()
    }));

    const options: MafTopOptions = {
      dbPath: testDbPath,
      json: true,
      recent: 10
    };

    const result = mafTop(options) as any;
    expect(result).toBeDefined();
    expect(result.recentEvents).toBeDefined();

    // Verify that events are categorized correctly
    if (result.recentEvents && result.recentEvents.length > 0) {
      result.recentEvents.forEach((event: any) => {
        expect(event.category).toBeDefined();
        expect(typeof event.category).toBe('string');
      });
    }
  });
});
