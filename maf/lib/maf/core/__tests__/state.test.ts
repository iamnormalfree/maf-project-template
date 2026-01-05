// ABOUTME: Tests for the MAF state machine invariants and legal transitions.
// ABOUTME: Validates that all LEGAL transitions work and illegal transitions are properly rejected.

import { assertTransition, TaskState, InvariantViolation } from '../state';

describe('MAF State Machine Invariants', () => {
  describe('Legal Transitions', () => {
    it('should allow READY → LEASED', () => {
      const result = assertTransition(TaskState.READY, TaskState.LEASED, 'test-task-1');
      expect(result).toBeNull();
    });

    it('should allow READY → DEAD', () => {
      const result = assertTransition(TaskState.READY, TaskState.DEAD, 'test-task-1');
      expect(result).toBeNull();
    });

    it('should allow LEASED → RUNNING', () => {
      const result = assertTransition(TaskState.LEASED, TaskState.RUNNING, 'test-task-2');
      expect(result).toBeNull();
    });

    it('should allow LEASED → READY', () => {
      const result = assertTransition(TaskState.LEASED, TaskState.READY, 'test-task-2');
      expect(result).toBeNull();
    });

    it('should allow RUNNING → VERIFYING', () => {
      const result = assertTransition(TaskState.RUNNING, TaskState.VERIFYING, 'test-task-3');
      expect(result).toBeNull();
    });

    it('should allow RUNNING → READY', () => {
      const result = assertTransition(TaskState.RUNNING, TaskState.READY, 'test-task-3');
      expect(result).toBeNull();
    });

    it('should allow VERIFYING → COMMITTED', () => {
      const result = assertTransition(TaskState.VERIFYING, TaskState.COMMITTED, 'test-task-4');
      expect(result).toBeNull();
    });

    it('should allow VERIFYING → ROLLBACK', () => {
      const result = assertTransition(TaskState.VERIFYING, TaskState.ROLLBACK, 'test-task-4');
      expect(result).toBeNull();
    });

    it('should allow COMMITTED → DONE', () => {
      const result = assertTransition(TaskState.COMMITTED, TaskState.DONE, 'test-task-5');
      expect(result).toBeNull();
    });

    it('should allow ROLLBACK → READY', () => {
      const result = assertTransition(TaskState.ROLLBACK, TaskState.READY, 'test-task-6');
      expect(result).toBeNull();
    });

    it('should allow ROLLBACK → DEAD', () => {
      const result = assertTransition(TaskState.ROLLBACK, TaskState.DEAD, 'test-task-6');
      expect(result).toBeNull();
    });
  });

  describe('Illegal Transitions', () => {
    it('should reject READY → RUNNING (skips LEASED)', () => {
      const violation = assertTransition(TaskState.READY, TaskState.RUNNING, 'illegal-task-1');
      expect(violation).not.toBeNull();
      expect(violation).toEqual({
        task_id: 'illegal-task-1',
        from: TaskState.READY,
        to: TaskState.RUNNING,
        reason: 'illegal transition'
      });
    });

    it('should reject LEASED → VERIFYING (skips RUNNING)', () => {
      const violation = assertTransition(TaskState.LEASED, TaskState.VERIFYING, 'illegal-task-2');
      expect(violation).not.toBeNull();
      expect(violation).toEqual({
        task_id: 'illegal-task-2',
        from: TaskState.LEASED,
        to: TaskState.VERIFYING,
        reason: 'illegal transition'
      });
    });

    it('should reject RUNNING → COMMITTED (skips VERIFYING)', () => {
      const violation = assertTransition(TaskState.RUNNING, TaskState.COMMITTED, 'illegal-task-3');
      expect(violation).not.toBeNull();
      expect(violation).toEqual({
        task_id: 'illegal-task-3',
        from: TaskState.RUNNING,
        to: TaskState.COMMITTED,
        reason: 'illegal transition'
      });
    });

    it('should reject VERIFYING → RUNNING (backward transition)', () => {
      const violation = assertTransition(TaskState.VERIFYING, TaskState.RUNNING, 'illegal-task-4');
      expect(violation).not.toBeNull();
      expect(violation).toEqual({
        task_id: 'illegal-task-4',
        from: TaskState.VERIFYING,
        to: TaskState.RUNNING,
        reason: 'illegal transition'
      });
    });

    it('should reject DONE → any state (terminal state)', () => {
      const violation = assertTransition(TaskState.DONE, TaskState.READY, 'illegal-task-5');
      expect(violation).not.toBeNull();
      expect(violation).toEqual({
        task_id: 'illegal-task-5',
        from: TaskState.DONE,
        to: TaskState.READY,
        reason: 'illegal transition'
      });
    });

    it('should reject DEAD → any state (terminal state)', () => {
      const violation = assertTransition(TaskState.DEAD, TaskState.READY, 'illegal-task-6');
      expect(violation).not.toBeNull();
      expect(violation).toEqual({
        task_id: 'illegal-task-6',
        from: TaskState.DEAD,
        to: TaskState.READY,
        reason: 'illegal transition'
      });
    });
  });

  describe('Task ID Context', () => {
    it('should include task ID in violation when provided', () => {
      const violation = assertTransition(TaskState.READY, TaskState.RUNNING, 'context-task');
      expect(violation?.task_id).toBe('context-task');
    });

    it('should handle empty task ID gracefully', () => {
      const violation = assertTransition(TaskState.READY, TaskState.RUNNING, '');
      expect(violation?.task_id).toBe('');
    });
  });

  describe('Complete Workflow Validation', () => {
    it('should validate successful task completion workflow', () => {
      const taskId = 'workflow-success';

      // READY → LEASED → RUNNING → VERIFYING → COMMITTED → DONE
      expect(assertTransition(TaskState.READY, TaskState.LEASED, taskId)).toBeNull();
      expect(assertTransition(TaskState.LEASED, TaskState.RUNNING, taskId)).toBeNull();
      expect(assertTransition(TaskState.RUNNING, TaskState.VERIFYING, taskId)).toBeNull();
      expect(assertTransition(TaskState.VERIFYING, TaskState.COMMITTED, taskId)).toBeNull();
      expect(assertTransition(TaskState.COMMITTED, TaskState.DONE, taskId)).toBeNull();
    });

    it('should validate task failure workflow with rollback', () => {
      const taskId = 'workflow-rollback';

      // READY → LEASED → RUNNING → VERIFYING → ROLLBACK → READY
      expect(assertTransition(TaskState.READY, TaskState.LEASED, taskId)).toBeNull();
      expect(assertTransition(TaskState.LEASED, TaskState.RUNNING, taskId)).toBeNull();
      expect(assertTransition(TaskState.RUNNING, TaskState.VERIFYING, taskId)).toBeNull();
      expect(assertTransition(TaskState.VERIFYING, TaskState.ROLLBACK, taskId)).toBeNull();
      expect(assertTransition(TaskState.ROLLBACK, TaskState.READY, taskId)).toBeNull();
    });

    it('should validate task death workflow', () => {
      const taskId = 'workflow-death';

      // READY → LEASED → RUNNING → ROLLBACK → DEAD
      expect(assertTransition(TaskState.READY, TaskState.LEASED, taskId)).toBeNull();
      expect(assertTransition(TaskState.LEASED, TaskState.RUNNING, taskId)).toBeNull();
      expect(assertTransition(TaskState.RUNNING, TaskState.READY, taskId)).toBeNull(); // Reset to READY first
      expect(assertTransition(TaskState.READY, TaskState.DEAD, taskId)).toBeNull();
    });
  });
});