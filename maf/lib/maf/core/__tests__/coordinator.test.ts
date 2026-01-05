// ABOUTME: Tests coordinator dispatch behavior and correct event logging.
// ABOUTME: Validates that coordinator does NOT duplicate scheduler CLAIMED events per blueprint.

import { createMafCoordinator } from '../coordinator';
import type { MafProtocolEnvelope, MafTaskClaim, MafWorkComplete } from '../protocols';

describe('MafCoordinator', () => {
  let mockEventLogger: any;
  let mockRuntimeState: any;
  let coordinator: any;

  beforeEach(() => {
    mockEventLogger = {
      logTaskClaimed: jest.fn(),
      logTaskRunning: jest.fn(),
      logTaskVerifying: jest.fn(),
      logTaskCommitted: jest.fn(),
      logTaskError: jest.fn()
    };

    mockRuntimeState = {
      enqueue: jest.fn(),
      refresh: jest.fn()
    };

    coordinator = createMafCoordinator({
      runtime: mockRuntimeState,
      beadsExecutable: '/test/beads',
      agentMailRoot: '/test/mail',
      eventLogger: mockEventLogger
    });
  });

  describe('dispatch method', () => {
    it('should NOT log CLAIMED event for TASK_CLAIM messages (per blueprint)', async () => {
      const taskClaimMessage: MafTaskClaim = {
        type: 'TASK_CLAIM',
        agentId: 'agent-1',
        beadId: 'bead-123',
        files: ['file1.ts'],
        etaMinutes: 30
      };

      await coordinator.dispatch(taskClaimMessage);

      // FIXED: Coordinator should NOT log CLAIMED events per blueprint
      // Only scheduler should generate CLAIMED events as single source of truth
      expect(mockEventLogger.logTaskClaimed).not.toHaveBeenCalled();
      expect(mockEventLogger.logTaskRunning).not.toHaveBeenCalled();
      
      // Verify message is still enqueued
      expect(mockRuntimeState.enqueue).toHaveBeenCalledWith(taskClaimMessage);
    });

    it('should log VERIFYING event for WORK_COMPLETE messages', async () => {
      const workCompleteMessage: MafWorkComplete = {
        type: 'WORK_COMPLETE',
        agentId: 'agent-1',
        beadId: 'bead-123',
        tests: {
          passed: true,
          command: 'npm test'
        },
        commit: 'abc123'
      };

      await coordinator.dispatch(workCompleteMessage);

      // Verify only VERIFYING event is logged (not both verifying and committed)
      expect(mockEventLogger.logTaskVerifying).toHaveBeenCalledWith('bead-123');
      expect(mockEventLogger.logTaskCommitted).not.toHaveBeenCalled();
      
      // Verify message is enqueued
      expect(mockRuntimeState.enqueue).toHaveBeenCalledWith(workCompleteMessage);
    });

    it('should not log events when event logger is not configured', async () => {
      const coordinatorWithoutLogger = createMafCoordinator({
        runtime: mockRuntimeState,
        beadsExecutable: '/test/beads',
        agentMailRoot: '/test/mail'
        // No eventLogger configured
      });

      const taskClaimMessage: MafTaskClaim = {
        type: 'TASK_CLAIM',
        agentId: 'agent-1',
        beadId: 'bead-123',
        files: ['file1.ts'],
        etaMinutes: 30
      };

      await coordinatorWithoutLogger.dispatch(taskClaimMessage);

      // Verify no events are logged but message is still enqueued
      expect(mockRuntimeState.enqueue).toHaveBeenCalledWith(taskClaimMessage);
    });

    it('should handle multiple message types correctly without duplicating CLAIMED events', async () => {
      const taskClaimMessage: MafTaskClaim = {
        type: 'TASK_CLAIM',
        agentId: 'agent-1',
        beadId: 'bead-123',
        files: ['file1.ts'],
        etaMinutes: 30
      };

      const workCompleteMessage: MafWorkComplete = {
        type: 'WORK_COMPLETE',
        agentId: 'agent-2',
        beadId: 'bead-456',
        tests: {
          passed: true,
          command: 'npm test'
        }
      };

      // Process both messages
      await coordinator.dispatch(taskClaimMessage);
      await coordinator.dispatch(workCompleteMessage);

      // FIXED: Coordinator should NOT log CLAIMED events per blueprint
      expect(mockEventLogger.logTaskClaimed).not.toHaveBeenCalled();
      expect(mockEventLogger.logTaskVerifying).toHaveBeenCalledWith('bead-456');
      expect(mockEventLogger.logTaskRunning).not.toHaveBeenCalled();
      expect(mockEventLogger.logTaskCommitted).not.toHaveBeenCalled();
      
      // Verify both messages were enqueued
      expect(mockRuntimeState.enqueue).toHaveBeenCalledTimes(2);
      expect(mockRuntimeState.enqueue).toHaveBeenNthCalledWith(1, taskClaimMessage);
      expect(mockRuntimeState.enqueue).toHaveBeenNthCalledWith(2, workCompleteMessage);
    });
  });

  describe('refreshRuntimeState method', () => {
    it('should refresh runtime state', async () => {
      await coordinator.refreshRuntimeState();
      expect(mockRuntimeState.refresh).toHaveBeenCalled();
    });
  });

  describe('claimNextTask method', () => {
    it('should return null when no scheduler is configured', async () => {
      const coordinatorWithoutScheduler = createMafCoordinator({
        runtime: mockRuntimeState,
        beadsExecutable: '/test/beads',
        agentMailRoot: '/test/mail',
        eventLogger: mockEventLogger
      });

      const result = await coordinatorWithoutScheduler.claimNextTask('agent-1');
      expect(result).toBeNull();
    });

    it('should NOT log CLAIMED event when task is successfully claimed (per blueprint)', async () => {
      const mockScheduler = {
        pickNextTask: jest.fn().mockResolvedValue({
          beadId: 'bead-123',
          taskData: 'test'
        })
      };

      const coordinatorWithScheduler = createMafCoordinator({
        runtime: mockRuntimeState,
        beadsExecutable: '/test/beads',
        agentMailRoot: '/test/mail',
        scheduler: mockScheduler,
        eventLogger: mockEventLogger
      });

      const result = await coordinatorWithScheduler.claimNextTask('agent-1');

      expect(mockScheduler.pickNextTask).toHaveBeenCalledWith('agent-1');
      // FIXED: Coordinator should NOT log CLAIMED events per blueprint
      // Individual scheduler implementations are responsible for logging their own CLAIMED events
      expect(mockEventLogger.logTaskClaimed).not.toHaveBeenCalled();
      expect(result).toEqual({
        beadId: 'bead-123',
        taskData: 'test'
      });
    });

    it('should not log CLAIMED event when no task is available', async () => {
      const mockScheduler = {
        pickNextTask: jest.fn().mockResolvedValue(null)
      };

      const coordinatorWithScheduler = createMafCoordinator({
        runtime: mockRuntimeState,
        beadsExecutable: '/test/beads',
        agentMailRoot: '/test/mail',
        scheduler: mockScheduler,
        eventLogger: mockEventLogger
      });

      const result = await coordinatorWithScheduler.claimNextTask('agent-1');

      expect(mockScheduler.pickNextTask).toHaveBeenCalledWith('agent-1');
      expect(mockEventLogger.logTaskClaimed).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});
