const ORCHESTRATION_CONFLICT_CODE = 'orchestration-conflict';
const ORCHESTRATION_NOT_FOUND_CODE = 'orchestration-not-found';
const ORCHESTRATION_SEAT_CODE = 'orchestration-seat';
const ORCHESTRATION_TEMPLATE_CODE = 'orchestration-template';
const ORCHESTRATION_RUN_CODE = 'orchestration-run';

export class OrchestrationConflictError extends Error {
  readonly code = ORCHESTRATION_CONFLICT_CODE;

  constructor(
    readonly key: string,
    readonly holderPid?: number,
  ) {
    super(
      holderPid === undefined
        ? `Orchestration ${key} is already occupied`
        : `Orchestration ${key} is already occupied by pid ${holderPid}`,
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

  constructor(
    readonly key: string,
    message: string,
  ) {
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

export class OrchestrationRunError extends Error {
  readonly code = ORCHESTRATION_RUN_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'OrchestrationRunError';
  }
}
