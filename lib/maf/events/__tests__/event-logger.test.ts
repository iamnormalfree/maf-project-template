// ABOUTME: Tests for the SQLite-first event logging system with extended event types.
// ABOUTME: Validates typed event emission, chronological retrieval, database integration, and new quota/supervision events.

import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { 
  createMafEventLogger, 
  MafEventLogger,
  MafEventKind,
  MafEventDisplayFormat,
  formatEventForDisplay,
  isQuotaExceededData,
  isQuotaWarningData,
  isAgentStartedData,
  isAgentStoppedData,
  isAgentHealthCheckData,
  isPerformanceThresholdData,
  isBackpressureDetectedData,
  MafEventQuotaExceededData,
  MafEventQuotaWarningData,
  MafEventAgentStartedData,
  MafEventAgentStoppedData,
  MafEventAgentHealthCheckData,
  MafEventPerformanceThresholdData,
  MafEventBackpressureDetectedData
} from '../event-logger';
import { TaskState } from '../../core/state';

describe('MafEventLogger - Extended Schema', () => {
  let mockDb: any;
  let eventLogger: MafEventLogger;
  let mockInsertEvent: jest.MockedFunction<any>;
  let mockGetEvents: jest.MockedFunction<any>;
  let mockGetAllEvents: jest.MockedFunction<any>;
  let mockGetEventsByKind: jest.MockedFunction<any>;
  let mockGetEventsByTimeRange: jest.MockedFunction<any>;

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
    // Create mock database
    mockInsertEvent = jest.fn();
    mockGetEvents = jest.fn();
    mockGetAllEvents = jest.fn();
    mockGetEventsByKind = jest.fn();
    mockGetEventsByTimeRange = jest.fn();
    
    mockDb = {
      prepare: jest.fn().mockImplementation((query: string) => {

        // More specific matches first
        if (query.includes('WHERE kind = ?')) {

          return { all: mockGetEventsByKind };
        }
        if (query.includes('WHERE ts >= ? AND ts <= ?')) {
          return { all: mockGetEventsByTimeRange };
        }
        if (query.includes('WHERE task_id = ?')) {
          return { all: mockGetEvents };
        }
        if (query.includes('ORDER BY ts DESC') && query.includes('LIMIT')) {
          return { all: mockGetAllEvents };
        }
        if (query.includes('INSERT INTO events')) {
          return { run: mockInsertEvent };
        }
        
        return { all: jest.fn().mockReturnValue([]) };
      }),
      close: jest.fn()
    };

    // Mock the events array to simulate database storage
    let events: any[] = [];
    
    mockInsertEvent.mockImplementation((taskId: string, ts: number, kind: string, dataJson: string) => {
      const id = events.length + 1;
      events.push({
        id,
        task_id: taskId,
        ts,
        kind,
        data_json: dataJson
      });
      return { lastInsertRowid: id, changes: 1 };
    });

    mockGetEvents.mockImplementation((taskId: string) => {
      return events
        .filter(event => event.task_id === taskId)
        .sort((a, b) => a.ts - b.ts);
    });

    mockGetAllEvents.mockImplementation((limit: number) => {
      return events
        .sort((a, b) => b.ts - a.ts)
        .slice(0, limit);
    });

    mockGetEventsByKind.mockImplementation((kind: string, limit: number) => {
      return events
        .filter(event => event.kind === kind)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, limit);
    });

    mockGetEventsByTimeRange.mockImplementation((startTime: number, endTime: number) => {
      return events
        .filter(event => event.ts >= startTime && event.ts <= endTime)
        .sort((a, b) => a.ts - b.ts);
    });

    eventLogger = createMafEventLogger(mockDb as any);
    events = []; // Reset events for each test
  });

  describe('Backward Compatibility', () => {
    it('should preserve all original event logging methods', () => {
      const taskId = 'backward-compat-test';
      const agentId = 'agent-123';
      const error = new Error('Test error');

      // Test all original methods still work
      eventLogger.logTaskClaimed(taskId, agentId, 1);
      eventLogger.logTaskRunning(taskId);
      eventLogger.logTaskVerifying(taskId);
      eventLogger.logTaskCommitted(taskId);
      eventLogger.logTaskError(taskId, error);

      const calls = mockInsertEvent.mock.calls;
      const eventKinds = calls.map(call => call[2]); // kind is the 3rd parameter
      
      expect(eventKinds).toContain('CLAIMED');
      expect(eventKinds).toContain('RUNNING');
      expect(eventKinds).toContain('VERIFYING');
      expect(eventKinds).toContain('COMMITTED');
      expect(eventKinds).toContain('ERROR');
    });

    it('should maintain original interface types', () => {
      const taskId = 'type-test';
      
      // This should compile without TypeScript errors
      const events = eventLogger.getTaskEvents(taskId);
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('Quota Events', () => {
    describe('logQuotaExceeded', () => {
      it('should log QUOTA_EXCEEDED events with required fields', () => {
        const quotaData: MafEventQuotaExceededData = {
          quota_type: 'token',
          current_usage: 15000,
          limit: 10000,
          policy_label: 'test-policy'
        };

        eventLogger.logQuotaExceeded(quotaData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'system:quota-monitor',
          expect.any(Number),
          'QUOTA_EXCEEDED',
          JSON.stringify(quotaData)
        );
      });

      it('should use custom task_id when provided', () => {
        const quotaData: MafEventQuotaExceededData = {
          quota_type: 'cost',
          current_usage: 500,
          limit: 300,
          task_id: 'custom-task-123'
        };

        eventLogger.logQuotaExceeded(quotaData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'custom-task-123',
          expect.any(Number),
          'QUOTA_EXCEEDED',
          JSON.stringify(quotaData)
        );
      });

      it('should handle all quota types', () => {
        const quotaTypes: MafEventQuotaExceededData['quota_type'][] = ['token', 'cost', 'time', 'rate_limit'];
        
        quotaTypes.forEach(quota_type => {
          const quotaData: MafEventQuotaExceededData = {
            quota_type,
            current_usage: 100,
            limit: 50
          };

          eventLogger.logQuotaExceeded(quotaData);

          expect(mockInsertEvent).toHaveBeenCalledWith(
            'system:quota-monitor',
            expect.any(Number),
            'QUOTA_EXCEEDED',
            expect.stringContaining(`\"quota_type\":\"${quota_type}\"`)
          );
        });
      });
    });

    describe('logQuotaWarning', () => {
      it('should log QUOTA_WARNING events with threshold percent', () => {
        const quotaData: MafEventQuotaWarningData = {
          quota_type: 'token',
          current_usage: 8500,
          limit: 10000,
          threshold_percent: 85
        };

        eventLogger.logQuotaWarning(quotaData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'system:quota-monitor',
          expect.any(Number),
          'QUOTA_WARNING',
          JSON.stringify(quotaData)
        );
      });
    });
  });

  describe('Agent Lifecycle Events', () => {
    describe('logAgentStarted', () => {
      it('should log AGENT_STARTED events', () => {
        const agentData: MafEventAgentStartedData = {
          agent_id: 'agent-456',
          agent_type: 'task-processor',
          version: '1.2.3',
          capabilities: ['processing', 'validation'],
          config: { timeout: 30000 }
        };

        eventLogger.logAgentStarted(agentData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'system:agent-supervisor',
          expect.any(Number),
          'AGENT_STARTED',
          JSON.stringify(agentData)
        );
      });

      it('should use parent_task_id when provided', () => {
        const agentData: MafEventAgentStartedData = {
          agent_id: 'agent-789',
          agent_type: 'specialized-processor',
          parent_task_id: 'parent-task-123'
        };

        eventLogger.logAgentStarted(agentData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'parent-task-123',
          expect.any(Number),
          'AGENT_STARTED',
          JSON.stringify(agentData)
        );
      });
    });

    describe('logAgentStopped', () => {
      it('should log AGENT_STOPPED events', () => {
        const agentData: MafEventAgentStoppedData = {
          agent_id: 'agent-456',
          reason: 'completion',
          duration_ms: 45000,
          tasks_completed: 15,
          final_state: 'success'
        };

        eventLogger.logAgentStopped(agentData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'system:agent-supervisor',
          expect.any(Number),
          'AGENT_STOPPED',
          JSON.stringify(agentData)
        );
      });

      it('should handle agent stopped with error', () => {
        const agentData: MafEventAgentStoppedData = {
          agent_id: 'agent-error',
          reason: 'error',
          duration_ms: 12000,
          error: {
            message: 'Agent crashed',
            name: 'RuntimeError',
            stack: "Error: Agent crashed\n  at process",
          }
        };

        eventLogger.logAgentStopped(agentData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'system:agent-supervisor',
          expect.any(Number),
          'AGENT_STOPPED',
          JSON.stringify(agentData)
        );
      });
    });

    describe('logAgentHealthCheck', () => {
      it('should log AGENT_HEALTH_CHECK events', () => {
        const healthData: MafEventAgentHealthCheckData = {
          agent_id: 'agent-456',
          status: 'healthy',
          checks: [
            { name: 'memory', status: 'pass', value: 256, threshold: 512 },
            { name: 'cpu', status: 'warn', value: 85, threshold: 80 },
            { name: 'connectivity', status: 'pass', message: 'All good' }
          ],
          resource_usage: {
            cpu_percent: 75,
            memory_mb: 256,
            active_tasks: 3,
            queue_depth: 1
          }
        };

        eventLogger.logAgentHealthCheck(healthData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'system:agent-supervisor',
          expect.any(Number),
          'AGENT_HEALTH_CHECK',
          JSON.stringify(healthData)
        );
      });
    });
  });

  describe('Performance Monitoring Events', () => {
    describe('logPerformanceThreshold', () => {
      it('should log PERFORMANCE_THRESHOLD events', () => {
        const perfData: MafEventPerformanceThresholdData = {
          threshold_type: 'latency',
          metric_name: 'task_completion_time',
          current_value: 5000,
          threshold_value: 3000,
          direction: 'above',
          severity: 'warning',
          task_id: 'slow-task-123'
        };

        eventLogger.logPerformanceThreshold(perfData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'slow-task-123',
          expect.any(Number),
          'PERFORMANCE_THRESHOLD',
          JSON.stringify(perfData)
        );
      });

      it('should use system task_id when not provided', () => {
        const perfData: MafEventPerformanceThresholdData = {
          threshold_type: 'throughput',
          metric_name: 'tasks_per_second',
          current_value: 5,
          threshold_value: 10,
          direction: 'below',
          severity: 'critical'
        };

        eventLogger.logPerformanceThreshold(perfData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'system:performance-monitor',
          expect.any(Number),
          'PERFORMANCE_THRESHOLD',
          JSON.stringify(perfData)
        );
      });
    });

    describe('logBackpressureDetected', () => {
      it('should log BACKPRESSURE_DETECTED events', () => {
        const backpressureData: MafEventBackpressureDetectedData = {
          source: 'queue',
          current_depth: 950,
          max_capacity: 1000,
          pressure_percent: 95,
          affected_components: ['task-processor', 'validator'],
          mitigation_active: true,
          mitigation_strategy: 'scale-up',
          recovery_actions: ['add-workers', 'increase-memory']
        };

        eventLogger.logBackpressureDetected(backpressureData);

        expect(mockInsertEvent).toHaveBeenCalledWith(
          'system:backpressure-monitor',
          expect.any(Number),
          'BACKPRESSURE_DETECTED',
          JSON.stringify(backpressureData)
        );
      });
    });
  });

  describe('Utility Methods', () => {
    describe('getAllEvents', () => {
      it('should return all events with default limit', () => {
        const mockEvents = [
          { id: 1, task_id: 'task1', ts: 3000, kind: 'COMMITTED', data_json: '{}' },
          { id: 2, task_id: 'task2', ts: 2000, kind: 'RUNNING', data_json: '{}' }
        ];
        mockGetAllEvents.mockReturnValue(mockEvents);

        const events = eventLogger.getAllEvents();
        
        expect(events).toEqual(mockEvents);
        expect(mockGetAllEvents).toHaveBeenCalledWith(100);
      });

      it('should respect custom limit', () => {
        eventLogger.getAllEvents(50);
        expect(mockGetAllEvents).toHaveBeenCalledWith(50);
      });
    });

    describe('getEventsByKind', () => {
      it('should return events filtered by kind', () => {
        // Test that the method calls the database correctly
        eventLogger.getEventsByKind('QUOTA_EXCEEDED', 25);
        
        expect(mockGetEventsByKind).toHaveBeenCalledWith('QUOTA_EXCEEDED', 25);
      });
    });

    describe('getEventsByTimeRange', () => {
      it('should return events within time range', () => {
        const timeRangeEvents = [
          { id: 1, task_id: 'task1', ts: 1500, kind: 'RUNNING', data_json: '{}' }
        ];
        mockGetEventsByTimeRange.mockReturnValue(timeRangeEvents);

        const events = eventLogger.getEventsByTimeRange(1000, 2000);
        
        expect(events).toEqual(timeRangeEvents);
        expect(mockGetEventsByTimeRange).toHaveBeenCalledWith(1000, 2000);
      });
    });

    describe('formatEventsForCli', () => {
      it('should format events for CLI display', () => {
        const mockEvents = [
          {
            id: 1,
            task_id: 'task1',
            ts: 1609459200000, // 2021-01-01 00:00:00 UTC
            kind: 'QUOTA_EXCEEDED',
            data_json: JSON.stringify({
              quota_type: 'token',
              current_usage: 15000,
              limit: 10000,
              policy_label: 'test-policy'
            })
          },
          {
            id: 2,
            task_id: 'system:agent-supervisor',
            ts: 1609459260000,
            kind: 'AGENT_STARTED',
            data_json: JSON.stringify({
              agent_id: 'agent-123',
              agent_type: 'processor'
            })
          }
        ];

        const formatted = eventLogger.formatEventsForCli(mockEvents);
        
        expect(formatted).toHaveLength(2);
        expect(formatted[0]).toMatchObject({
          kind: 'QUOTA_EXCEEDED',
          timestamp: '2021-01-01T00:00:00.000Z',
          summary: 'TOKEN quota exceeded: 15000/10000',
          details: 'Policy: test-policy',
          severity: 'error'
        });
        
        expect(formatted[1]).toMatchObject({
          kind: 'AGENT_STARTED',
          timestamp: '2021-01-01T00:01:00.000Z',
          summary: 'Agent agent-123 (processor) started',
          severity: 'info'
        });
      });
    });
  });

  describe('Type Guards', () => {
    describe('isQuotaExceededData', () => {
      it('should return true for valid quota exceeded data', () => {
        const data = {
          quota_type: 'token',
          current_usage: 15000,
          limit: 10000
        };
        
        expect(isQuotaExceededData(data)).toBe(true);
      });

      it('should return false for invalid data', () => {
        expect(isQuotaExceededData(null)).toBe(false);
        expect(isQuotaExceededData({})).toBe(false);
        expect(isQuotaExceededData({ quota_type: 'token' })).toBe(false);
        expect(isQuotaExceededData({ quota_type: 'token', current_usage: 'invalid' })).toBe(false);
      });
    });

    describe('isQuotaWarningData', () => {
      it('should return true for valid quota warning data', () => {
        const data = {
          quota_type: 'cost',
          current_usage: 85,
          limit: 100,
          threshold_percent: 85
        };
        
        expect(isQuotaWarningData(data)).toBe(true);
      });
    });

    describe('isAgentStartedData', () => {
      it('should return true for valid agent started data', () => {
        const data = {
          agent_id: 'agent-123',
          agent_type: 'processor'
        };
        
        expect(isAgentStartedData(data)).toBe(true);
      });
    });

    describe('isAgentStoppedData', () => {
      it('should return true for valid agent stopped data', () => {
        const data = {
          agent_id: 'agent-123',
          reason: 'completion',
          duration_ms: 45000
        };
        
        expect(isAgentStoppedData(data)).toBe(true);
      });
    });

    describe('isAgentHealthCheckData', () => {
      it('should return true for valid health check data', () => {
        const data = {
          agent_id: 'agent-123',
          status: 'healthy',
          checks: [
            { name: 'memory', status: 'pass' }
          ]
        };
        
        expect(isAgentHealthCheckData(data)).toBe(true);
      });
    });

    describe('isPerformanceThresholdData', () => {
      it('should return true for valid performance threshold data', () => {
        const data = {
          threshold_type: 'latency',
          metric_name: 'response_time',
          current_value: 5000,
          threshold_value: 3000
        };
        
        expect(isPerformanceThresholdData(data)).toBe(true);
      });
    });

    describe('isBackpressureDetectedData', () => {
      it('should return true for valid backpressure data', () => {
        const data = {
          source: 'queue',
          current_depth: 950,
          max_capacity: 1000,
          pressure_percent: 95
        };
        
        expect(isBackpressureDetectedData(data)).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockInsertEvent.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      // Should not throw an error
      expect(() => {
        eventLogger.logQuotaExceeded({
          quota_type: 'token',
          current_usage: 100,
          limit: 50
        });
      }).not.toThrow();

      expect(console.error).toHaveBeenCalledWith(  expect.stringContaining("Failed to insert event QUOTA_EXCEEDED"),  expect.any(Error));
    });

    it('should handle query errors in utility methods', () => {
      mockGetAllEvents.mockImplementation(() => {
        throw new Error('Query failed');
      });

      const events = eventLogger.getAllEvents();
      expect(events).toEqual([]);
    });
  });

  describe('Event Display Formatting', () => {
    describe('formatEventForDisplay', () => {
      it('should format all event kinds correctly', () => {
        const testCases = [
          {
            kind: 'QUOTA_WARNING',
            data: { quota_type: 'cost', current_usage: 85, limit: 100, threshold_percent: 85 },
            expectedSummary: 'COST quota warning: 85/100 (85%)'
          },
          {
            kind: 'AGENT_STOPPED',
            data: { agent_id: 'agent-123', reason: 'timeout', duration_ms: 30000, tasks_completed: 5 },
            expectedSummary: 'Agent agent-123 stopped: timeout',
            expectedDetails: 'Duration: 30000ms, Tasks: 5'
          },
          {
            kind: 'BACKPRESSURE_DETECTED',
            data: { source: 'queue', current_depth: 950, max_capacity: 1000, pressure_percent: 95 },
            expectedSummary: 'Backpressure in queue: 95% capacity used',
            expectedSeverity: 'critical'
          },
          {
            kind: 'PERFORMANCE_THRESHOLD',
            data: { threshold_type: 'throughput', metric_name: 'tasks/sec', current_value: 5, threshold_value: 10, direction: 'below' },
            expectedSummary: 'throughput threshold: tasks/sec below threshold (5/10)'
          }
        ];

        testCases.forEach(({ kind, data, expectedSummary, expectedDetails, expectedSeverity }) => {
          const event = {
            id: 1,
            task_id: 'test',
            ts: Date.now(),
            kind,
            data_json: JSON.stringify(data)
          };

          const formatted = formatEventForDisplay(event);
          
          expect(formatted.kind).toBe(kind);
          expect(formatted.summary).toBe(expectedSummary);
          if (expectedDetails) {
            expect(formatted.details).toBe(expectedDetails);
          }
          if (expectedSeverity) {
            expect(formatted.severity).toBe(expectedSeverity);
          }
        });
      });

      it('should handle malformed JSON gracefully', () => {
        const event = {
          id: 1,
          task_id: 'test',
          ts: Date.now(),
          kind: 'QUOTA_EXCEEDED',
          data_json: 'invalid json'
        };

        const formatted = formatEventForDisplay(event);
        
        expect(formatted.summary).toBe('Invalid event data for QUOTA_EXCEEDED');
        expect(formatted.severity).toBe('error');
      });
    });
  });
});

describe('MafEventLogger - Integration Tests', () => {
  let mockDb: any;
  let eventLogger: MafEventLogger;

  beforeEach(() => {
    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        all: jest.fn().mockReturnValue([])
      })
    };
    
    eventLogger = createMafEventLogger(mockDb as any);
  });

  it('should support complete workflow with mixed event types', () => {
    const taskId = 'integration-task-123';
    const agentId = 'integration-agent';

    // Original workflow
    eventLogger.logTaskClaimed(taskId, agentId, 1);
    eventLogger.logTaskRunning(taskId);
    
    // Extended workflow - quota monitoring
    eventLogger.logQuotaWarning({
      quota_type: 'token',
      current_usage: 8000,
      limit: 10000,
      threshold_percent: 80,
      task_id: taskId
    });
    
    // Extended workflow - agent lifecycle
    eventLogger.logAgentStarted({
      agent_id: agentId,
      agent_type: 'task-processor',
      parent_task_id: taskId
    });
    
    // Continue original workflow
    eventLogger.logTaskVerifying(taskId);
    eventLogger.logTaskCommitted(taskId);
    
    // Extended workflow - agent completion
    eventLogger.logAgentStopped({
      agent_id: agentId,
      reason: 'completion',
      duration_ms: 30000,
      tasks_completed: 1
    });

    // Verify all events were logged
    const insertCalls = mockDb.prepare().run.mock.calls;
    const eventKinds = insertCalls.map(call => call[2]); // kind is the 3rd parameter
    
    expect(eventKinds).toEqual([
      'CLAIMED',
      'RUNNING', 
      'QUOTA_WARNING',
      'AGENT_STARTED',
      'VERIFYING',
      'COMMITTED',
      'AGENT_STOPPED'
    ]);
  });
});
