import type {
  PublicTaskDto,
  TaskManagerInputError,
  TaskManagerOperationError,
} from '@rivus/agent-task-loop/task-manager';

/**
 * Allowlist of fields that may appear in public API responses.
 * Any field not in this list is stripped by `sanitizePublicTask`.
 * Mirrors the spirit of `PublicTaskDto` from the core package.
 */
const PUBLIC_TASK_FIELDS: ReadonlySet<keyof PublicTaskDto> = new Set([
  'taskId',
  'title',
  'description',
  'project',
  'repository',
  'source',
  'targetAgent',
  'priority',
  'status',
  'progressSummary',
  'resultSummary',
  'prLink',
  'currentOwner',
  'reviewRound',
  'reviewVerdict',
  'acceptanceRound',
  'acceptanceVerdict',
  'createdAt',
  'updatedAt',
]);

/**
 * Coarse run phase — no PID, session id, or process forensics.
 */
export type RunPhase = 'idle' | 'starting' | 'running' | 'recovering' | 'failed' | 'unknown';

/**
 * Sanitize a public task DTO to ensure only allowlisted fields are present.
 * This is a defense-in-depth layer on top of `toPublicTask`.
 */
export function sanitizePublicTask(task: PublicTaskDto): PublicTaskDto {
  const sanitized: Record<string, unknown> = {};
  for (const key of PUBLIC_TASK_FIELDS) {
    if (key in task) {
      sanitized[key] = (task as unknown as Record<string, unknown>)[key];
    }
  }
  return sanitized as unknown as PublicTaskDto;
}

/**
 * Stable error response shape: a machine-readable `code` plus an optional
 * bounded, sanitized `message`. Never includes stacks, paths, or tokens.
 */
export interface ErrorResponse {
  error: {
    code: string;
    message?: string;
  };
}

const MAX_MESSAGE_LENGTH = 240;

function sanitizeMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const trimmed = message.replace(/\s+/g, ' ').trim();
  return trimmed.length > MAX_MESSAGE_LENGTH ? `${trimmed.slice(0, MAX_MESSAGE_LENGTH)}…` : trimmed;
}

/**
 * Map an application error to an HTTP status + stable error response.
 * Raw messages are sanitized and bounded.
 */
export function mapErrorToResponse(
  error: unknown,
): { status: number; body: ErrorResponse } {
  if (isInputError(error)) {
    return {
      status: error.code === 'task-already-active' ? 409 : 404,
      body: { error: { code: error.code, message: sanitizeMessage(error.message) } },
    };
  }
  if (isOperationError(error)) {
    return {
      status: 502,
      body: { error: { code: error.code, message: sanitizeMessage(error.message) } },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'internal-error', message: 'An unexpected error occurred' } },
  };
}

function isInputError(error: unknown): error is TaskManagerInputError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as TaskManagerInputError).name === 'TaskManagerInputError' &&
    typeof (error as TaskManagerInputError).code === 'string'
  );
}

function isOperationError(error: unknown): error is TaskManagerOperationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as TaskManagerOperationError).name === 'TaskManagerOperationError' &&
    typeof (error as TaskManagerOperationError).code === 'string'
  );
}
