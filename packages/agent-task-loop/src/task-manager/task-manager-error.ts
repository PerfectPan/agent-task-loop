export type TaskManagerErrorCode = 'task-not-found';
export type TaskManagerOperationErrorCode = 'task-backend-failed' | 'task-run-failed';

export class TaskManagerInputError extends Error {
  readonly name = 'TaskManagerInputError';

  constructor(
    readonly code: TaskManagerErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class TaskManagerOperationError extends Error {
  readonly name = 'TaskManagerOperationError';

  constructor(
    readonly code: TaskManagerOperationErrorCode,
    message: string,
  ) {
    super(message);
  }
}
