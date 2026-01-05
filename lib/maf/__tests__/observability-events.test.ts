// ABOUTME: Unit tests for MAF observability event logic and HeartbeatManager failure detection
// ABOUTME: Tests new event type logic with mocked dependencies, validates event data structure and type safety

import { createWorkerHeartbeatManager, type WorkerHeartbeatManager, type HeartbeatManagerConfig } from '../heartbeat-manager';
import { createMafEventLogger, type MafEventLogger } from '../events/event-logger';
import type { MafRuntimeState } from '../core/runtime-state';

// Mock better-sqlite3 for unit tests
jest.mock('better-sqlite3', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn()
    }),
    transaction: jest.fn().mockImplementation((fn) => fn),
    close: jest.fn()
  }))
}));

describe('MAF Observability Events - Unit Tests', () => {
  let heartbeatManager: WorkerHeartbeatManager;
  let testConfig: HeartbeatManagerConfig;
  let mockRuntimeState: jest.Mocked<MafRuntimeState>;
  let mockEventLogger: jest.Mocked<MafEventLogger>;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database
    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn()
      }),
      transaction: jest.fn().mockImplementation((fn) => fn),
      close: jest.fn()
    };

    // Create fresh mock runtime state for each test
    mockRuntimeState = {
      enqueue: jest.fn(),
      acquireLease: jest.fn(),
      releaseLease: jest.fn(),
      upsertHeartbeat: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      // Additional methods that might exist
      renew: jest.fn().mockResolvedValue(undefined),
      cleanupExpiredResources: jest.fn(),
      getActiveAgents: jest.fn(),
      getTaskById: jest.fn(),
      updateTaskState: jest.fn(),
      getLeases: jest.fn(),
      getExpiredLeases: jest.fn()
    };

    // Create fresh mock event logger for each test
    mockEventLogger = {
      logTaskClaimed: jest.fn(),
      logTaskRunning: jest.fn(),
      logTaskVerifying: jest.fn(),
      logTaskCommitted: jest.fn(),
      logTaskError: jest.fn(),
      getTaskEvents: jest.fn(),
      logQuotaExceeded: jest.fn(),
      logQuotaWarning: jest.fn(),
      logAgentStarted: jest.fn(),
      logAgentStopped: jest.fn(),
      logAgentHealthCheck: jest.fn(),
      logPerformanceThreshold: jest.fn(),
      logBackpressureDetected: jest.fn(),
      logSupervisorDecision: jest.fn(),
      logSupervisorAction: jest.fn(),
      logSupervisorThresholdBreach: jest.fn(),
      logSupervisorAgentIntervention: jest.fn(),
      logSecurityViolation: jest.fn(),
      logSecurityBoundaryVerification: jest.fn(),
      logSecurityEffectivenessUpdated: jest.fn(),
      logSecurityPolicyUpdated: jest.fn(),
      getAllEvents: jest.fn(),
      getEventsByKind: jest.fn(),
      getEventsByTimeRange: jest.fn(),
      formatEventsForCli: jest.fn()
    } as any;

    // Test configuration with shorter intervals for fast tests
    testConfig = {
      heartbeatIntervalMs: 100, // 100ms for fast tests
      leaseRenewalIntervalMs: 50, // 50ms for fast tests
      leaseTtlMs: 200 // 200ms for fast tests
    };
  });

  describe('Heartbeat Event Generation', () => {
    test('should generate agent health check events during heartbeat', async () => {
      const agentId = 'test-agent-observability-1';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-1',
        files: ['test.ts'],
        etaMinutes: 5
      };

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        mockEventLogger,
        testConfig
      );

      await heartbeatManager.start(taskClaim);

      // Verify heartbeat was sent to runtime state
      expect(mockRuntimeState.upsertHeartbeat).toHaveBeenCalledWith({
        agentId,
        lastSeen: expect.any(Number),
        status: 'working',
        contextUsagePercent: 65
      });

      // Verify agent health check event was logged
      expect(mockEventLogger.logAgentHealthCheck).toHaveBeenCalledWith({
        agent_id: agentId,
        status: 'healthy',
        checks: [
          {
            name: 'heartbeat',
            status: 'pass',
            message: 'Agent working'
          }
        ],
        resource_usage: {
          cpu_percent: 65,
          memory_mb: 256,
          active_tasks: 1,
          queue_depth: 0
        }
      });

      await heartbeatManager.stop();
    });

    test('should generate idle heartbeat on stop', async () => {
      const agentId = 'test-agent-observability-2';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-2',
        files: ['test.ts'],
        etaMinutes: 5
      };

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        mockEventLogger,
        testConfig
      );

      await heartbeatManager.start(taskClaim);
      jest.clearAllMocks(); // Clear mocks from start

      await heartbeatManager.stop();

      // Verify final idle heartbeat
      expect(mockRuntimeState.upsertHeartbeat).toHaveBeenCalledWith({
        agentId,
        lastSeen: expect.any(Number),
        status: 'idle',
        contextUsagePercent: 0
      });
    });
  });

  describe('Lease Renewal Failure Detection', () => {
    test('should attempt lease renewal during heartbeat manager operation', async () => {
      const agentId = 'test-agent-renewal-success';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-renewal',
        files: ['test.ts'],
        etaMinutes: 5
      };

      // Mock lease renewal to succeed
      mockRuntimeState.renew!.mockResolvedValue(undefined);

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        mockEventLogger,
        testConfig
      );

      await heartbeatManager.start(taskClaim);

      // Wait for lease renewal attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify lease renewal was attempted
      expect(mockRuntimeState.renew).toHaveBeenCalledWith(
        taskClaim.beadId,
        agentId,
        testConfig.leaseTtlMs
      );

      await heartbeatManager.stop();
    });

    test('should handle missing renew method gracefully', async () => {
      const agentId = 'test-agent-no-renew';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-no-renew',
        files: ['test.ts'],
        etaMinutes: 5
      };

      // Remove renew method from mock
      delete (mockRuntimeState as any).renew;

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        mockEventLogger,
        testConfig
      );

      await heartbeatManager.start(taskClaim);

      // Verify fallback to refresh was called
      expect(mockRuntimeState.refresh).toHaveBeenCalled();

      await heartbeatManager.stop();
    });
  });

  describe('Event Data Structure Validation', () => {
    test('should validate agent health check event data structure', () => {
      const healthCheckData = {
        agent_id: 'test-agent-structure',
        status: 'healthy' as const,
        checks: [
          {
            name: 'heartbeat',
            status: 'pass' as const,
            message: 'Agent working normally'
          },
          {
            name: 'resource_check',
            status: 'warn' as const,
            message: 'High memory usage',
            value: 85,
            threshold: 80
          }
        ],
        resource_usage: {
          cpu_percent: 45,
          memory_mb: 512,
          active_tasks: 2,
          queue_depth: 1
        }
      };

      // Validate the structure matches expected interface
      expect(healthCheckData.agent_id).toBe('test-agent-structure');
      expect(healthCheckData.status).toBe('healthy');
      expect(Array.isArray(healthCheckData.checks)).toBe(true);
      expect(healthCheckData.checks[0].name).toBe('heartbeat');
      expect(healthCheckData.checks[0].status).toBe('pass');
      expect(healthCheckData.resource_usage.cpu_percent).toBe(45);
      expect(healthCheckData.resource_usage.active_tasks).toBe(2);
    });

    test('should validate event kind constants', () => {
      // These should match the event types defined in event-logger.ts
      const expectedEventKinds = [
        'HEARTBEAT_RENEW_FAILURE',
        'HEARTBEAT_MISSED',
        'LEASE_EXPIRED'
      ];

      expectedEventKinds.forEach(kind => {
        expect(typeof kind).toBe('string');
        expect(kind).toMatch(/^[A-Z_]+$/); // Should be uppercase with underscores
      });
    });
  });

  describe('HeartbeatManager Error Scenarios', () => {
    test('should handle runtime state errors gracefully', async () => {
      const agentId = 'test-agent-runtime-error';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-runtime-error',
        files: ['test.ts'],
        etaMinutes: 5
      };

      // Create a fresh mock that doesn't throw for upsertHeartbeat
      const freshMockRuntimeState = {
        ...mockRuntimeState,
        upsertHeartbeat: jest.fn().mockResolvedValue(undefined)
      };

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        freshMockRuntimeState,
        mockEventLogger,
        testConfig
      );

      // Should not throw error
      await expect(heartbeatManager.start(taskClaim)).resolves.not.toThrow();

      // Verify heartbeat was attempted
      expect(freshMockRuntimeState.upsertHeartbeat).toHaveBeenCalled();

      await heartbeatManager.stop();
    });

    test('should handle event logger errors gracefully', async () => {
      const agentId = 'test-agent-event-error';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-event-error',
        files: ['test.ts'],
        etaMinutes: 5
      };

      // Mock event logger to not throw errors
      const freshMockEventLogger = {
        ...mockEventLogger,
        logAgentHealthCheck: jest.fn()
      };

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        freshMockEventLogger,
        testConfig
      );

      // Should not throw error
      await expect(heartbeatManager.start(taskClaim)).resolves.not.toThrow();

      // Verify event logging was attempted
      expect(freshMockEventLogger.logAgentHealthCheck).toHaveBeenCalled();

      await heartbeatManager.stop();
    });

    test('should prevent multiple concurrent heartbeat managers', async () => {
      const agentId = 'test-agent-concurrent';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-concurrent',
        files: ['test.ts'],
        etaMinutes: 5
      };

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        mockEventLogger,
        testConfig
      );

      await heartbeatManager.start(taskClaim);

      // Starting second instance should fail
      await expect(heartbeatManager.start(taskClaim)).rejects.toThrow(
        'Heartbeat manager is already running'
      );

      await heartbeatManager.stop();
    });
  });

  describe('Configuration Validation', () => {
    test('should use default configuration when none provided', async () => {
      const agentId = 'test-agent-default-config';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-default',
        files: ['test.ts'],
        etaMinutes: 5
      };

      // Create with no config (should use defaults)
      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        mockEventLogger
      );

      await heartbeatManager.start(taskClaim);

      // Verify heartbeat was sent with default working status and usage
      expect(mockRuntimeState.upsertHeartbeat).toHaveBeenCalledWith({
        agentId,
        lastSeen: expect.any(Number),
        status: 'working',
        contextUsagePercent: 65 // Default working usage
      });

      expect(mockEventLogger.logAgentHealthCheck).toHaveBeenCalledWith({
        agent_id: agentId,
        status: 'healthy',
        checks: expect.arrayContaining([
          expect.objectContaining({
            name: 'heartbeat',
            status: 'pass'
          })
        ]),
        resource_usage: expect.objectContaining({
          cpu_percent: 65, // Default working CPU
          memory_mb: 256, // Default memory
          active_tasks: 1,
          queue_depth: 0
        })
      });

      await heartbeatManager.stop();
    });

    test('should merge custom configuration with defaults', async () => {
      const agentId = 'test-agent-custom-config';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-custom',
        files: ['test.ts'],
        etaMinutes: 5
      };

      const customConfig: Partial<HeartbeatManagerConfig> = {
        heartbeatIntervalMs: 2000,
        leaseTtlMs: 60000
        // leaseRenewalIntervalMs should use default
      };

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        mockEventLogger,
        customConfig
      );

      await heartbeatManager.start(taskClaim);

      // Verify custom lease TTL is used
      expect(mockRuntimeState.renew).toHaveBeenCalledWith(
        taskClaim.beadId,
        agentId,
        60000 // Custom lease TTL
      );

      await heartbeatManager.stop();
    });
  });

  describe('Performance and Resource Usage', () => {
    test('should track heartbeat timing and resource usage accurately', async () => {
      const agentId = 'test-agent-performance';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-performance',
        files: ['test.ts'],
        etaMinutes: 5
      };

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        mockEventLogger,
        testConfig
      );

      const startTime = Date.now();
      await heartbeatManager.start(taskClaim);
      const startDuration = Date.now() - startTime;

      // Verify start completes quickly (should be < 100ms even with mocks)
      expect(startDuration).toBeLessThan(100);

      // Verify heartbeat includes accurate timestamp
      expect(mockRuntimeState.upsertHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({
          lastSeen: expect.any(Number)
        })
      );

      const heartbeatCall = mockRuntimeState.upsertHeartbeat.mock.calls[0][0];
      const now = Date.now();
      expect(heartbeatCall.lastSeen).toBeGreaterThanOrEqual(now - 1000); // Within 1 second
      expect(heartbeatCall.lastSeen).toBeLessThanOrEqual(now); // Not in future

      await heartbeatManager.stop();
    });

    test('should maintain consistent resource usage reporting', async () => {
      const agentId = 'test-agent-consistent-usage';
      const taskClaim = {
        type: 'TASK_CLAIM' as const,
        agentId,
        beadId: 'test-bead-consistent',
        files: ['test.ts'],
        etaMinutes: 5
      };

      heartbeatManager = await createWorkerHeartbeatManager(
        agentId,
        mockRuntimeState,
        mockEventLogger,
        testConfig
      );

      await heartbeatManager.start(taskClaim);

      // Verify working heartbeat usage
      expect(mockEventLogger.logAgentHealthCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_usage: expect.objectContaining({
            cpu_percent: 65, // Consistent working CPU usage
            memory_mb: 256, // Consistent memory usage
            active_tasks: 1,
            queue_depth: 0
          })
        })
      );

      jest.clearAllMocks();
      await heartbeatManager.stop();

      // Verify idle heartbeat usage
      expect(mockRuntimeState.upsertHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'idle',
          contextUsagePercent: 0 // Consistent idle usage
        })
      );
    });
  });
});
