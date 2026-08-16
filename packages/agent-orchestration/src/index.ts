export type {
  FactEntry,
  MailEntry,
  ObservedRun,
  OpenRunInput,
  ProcessRunner,
  ProcessRunnerInput,
  RunContextInput,
  RunSnapshot,
  SeatBind,
  SeatState,
  SeatStatus,
  SpawnResult,
  TemplateSpec,
} from './types';

export {
  ORCHESTRATION_CONFLICT_CODE,
  ORCHESTRATION_NOT_FOUND_CODE,
  ORCHESTRATION_SEAT_CODE,
  ORCHESTRATION_TEMPLATE_CODE,
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationSeatError,
  OrchestrationTemplateError,
} from './errors';

export { Orchestration, type OrchestrationOptions } from './orchestration';
export { TemplateRegistry } from './templates';
export { FileOrchestrationStore, type LockRecord, type OrchestrationStore } from './store';
export { defaultBaseDir, safeSegment } from './paths';
export { defaultProcessRunner } from './spawn';
