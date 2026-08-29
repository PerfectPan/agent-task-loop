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
} from './contracts/types';

export type {
  Clock,
  IntervalScheduler,
  LockRecord,
  OrchestrationStore,
  ProcessIdentity,
  ProcessLiveness,
} from './contracts/ports';

export {
  ORCHESTRATION_CONFLICT_CODE,
  ORCHESTRATION_NOT_FOUND_CODE,
  ORCHESTRATION_SEAT_CODE,
  ORCHESTRATION_TEMPLATE_CODE,
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationSeatError,
  OrchestrationTemplateError,
} from './contracts/errors';

export { Orchestration, type OrchestrationDependencies } from './application/orchestration';
export { TemplateRegistry } from './domain/template';
export { FileOrchestrationStore } from './infrastructure/file-store';
export { MemoryOrchestrationStore } from './infrastructure/memory-store';
export {
  createMemoryOrchestration,
  createOrchestration,
  type CreateOrchestrationOptions,
} from './infrastructure/node-factory';
export { defaultBaseDir, lockPath, safeSegment } from './infrastructure/node-paths';
export { execaProcessRunner as defaultProcessRunner } from './infrastructure/execa-runner';

/** @deprecated Use CreateOrchestrationOptions with createOrchestration(). */
export type OrchestrationOptions = import('./infrastructure/node-factory').CreateOrchestrationOptions;
