export const ORCHESTRATION_CONFLICT_CODE = 'orchestration-conflict';
export const ORCHESTRATION_NOT_FOUND_CODE = 'orchestration-not-found';
export const ORCHESTRATION_SEAT_CODE = 'orchestration-seat';
export const ORCHESTRATION_TEMPLATE_CODE = 'orchestration-template';
export const ORCHESTRATION_UNAUTHORIZED_CODE = 'orchestration-unauthorized';
export const ORCHESTRATION_VALIDATION_CODE = 'orchestration-validation';

export class OrchestrationConflictError extends Error {
  readonly code = ORCHESTRATION_CONFLICT_CODE;

  constructor(
    readonly key: string,
    readonly supervisorPid?: number,
  ) {
    super(
      supervisorPid === undefined
        ? `Orchestration ${key} is already occupied`
        : `Orchestration ${key} is already occupied by pid ${supervisorPid}`,
    );
    this.name = 'OrchestrationConflictError';
  }
}

export class OrchestrationNotFoundError extends Error {
  readonly code = ORCHESTRATION_NOT_FOUND_CODE;

  constructor(readonly key: string) {
    super(`Orchestration ${key} not found`);
    this.name = 'OrchestrationNotFoundError';
  }
}

export class OrchestrationSeatError extends Error {
  readonly code = ORCHESTRATION_SEAT_CODE;

  constructor(readonly key: string, message: string) {
    super(message);
    this.name = 'OrchestrationSeatError';
  }
}

export class OrchestrationTemplateError extends Error {
  readonly code = ORCHESTRATION_TEMPLATE_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'OrchestrationTemplateError';
  }
}

export class OrchestrationUnauthorizedError extends Error {
  readonly code = ORCHESTRATION_UNAUTHORIZED_CODE;

  constructor(readonly key: string, readonly seat: string) {
    super(`Seat ${seat} is not authorized to spawn on ${key}`);
    this.name = 'OrchestrationUnauthorizedError';
  }
}

export class OrchestrationValidationError extends Error {
  readonly code = ORCHESTRATION_VALIDATION_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'OrchestrationValidationError';
  }
}
