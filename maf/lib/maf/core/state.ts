// ABOUTME: Defines a minimal task state machine and legal transitions for orchestration.
// ABOUTME: Provides invariant checks to prevent illegal state changes during worker execution.

export type TaskID = string;
export type AgentID = string;

export enum TaskState {
  READY = 'READY',
  LEASED = 'LEASED',
  RUNNING = 'RUNNING',
  VERIFYING = 'VERIFYING',
  COMMITTED = 'COMMITTED',
  ROLLBACK = 'ROLLBACK',
  DONE = 'DONE',
  DEAD = 'DEAD',
}

export type InvariantViolation = {
  task_id: TaskID;
  from: TaskState;
  to: TaskState;
  reason: string;
};

const LEGAL: Record<TaskState, TaskState[]> = {
  [TaskState.READY]: [TaskState.LEASED, TaskState.DEAD],
  [TaskState.LEASED]: [TaskState.RUNNING, TaskState.READY],
  [TaskState.RUNNING]: [TaskState.VERIFYING, TaskState.READY],
  [TaskState.VERIFYING]: [TaskState.COMMITTED, TaskState.ROLLBACK],
  [TaskState.COMMITTED]: [TaskState.DONE],
  [TaskState.ROLLBACK]: [TaskState.READY, TaskState.DEAD],
  [TaskState.DONE]: [],
  [TaskState.DEAD]: [],
};

export function assertTransition(
  from: TaskState,
  to: TaskState,
  taskId: TaskID = '' as TaskID,
): InvariantViolation | null {
  return LEGAL[from]?.includes(to)
    ? null
    : { task_id: taskId, from, to, reason: 'illegal transition' };
}

