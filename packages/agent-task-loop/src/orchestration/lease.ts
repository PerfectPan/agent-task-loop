import os from 'node:os';
import path from 'node:path';
import type { PlatformService as PlatformServiceTag } from '@rivus/agent-kit/platform/effect';
import {
  createLeaseManager,
  fileLeaseRepository,
  LeaseRepository,
  memoryLeaseRepository,
  type LeaseHandle,
  type LeaseHeld,
  type LeaseLost,
  type LeaseRepositoryFailure,
} from '@rivus/agent-kit-collab/lease';
import { NodePlatformLive } from '@rivus/agent-kit/node/effect';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Scope from 'effect/Scope';
import { OrchestrationConflictError } from './errors';

/**
 * The occupancy lease renews at the old 15 s cadence and is judged stale by each
 * observer after 120 s without a confirmed renewal.
 */
export const TASK_LEASE_HEARTBEAT_MS = 15_000;
export const TASK_LEASE_TTL_MS = 120_000;

/**
 * The lease environment one occupancy runs in: a lease repository plus the
 * platform it was composed with, self-contained (`Layer.provideMerge` with the
 * Node platform, as the adoption guide prescribes).
 */
export type TaskLeaseEnvironment = Layer.Layer<LeaseRepository | PlatformServiceTag>;

/** The occupancy key of one Task. The name is part of the observable behavior of the CLI and the TUI. */
export function taskOrchestrationKey(taskId: string): string {
  return `task:${taskId}`;
}

/** The per-key directory the file lease repository and the run-state store share. */
export function defaultTaskLeaseDir(): string {
  return path.join(os.homedir(), '.agent-orchestration', 'runs');
}

/** A file-backed lease repository over `dir`, fed by the Node platform (the adoption guide's composition). */
export function fileTaskLeaseRepository(dir: string = defaultTaskLeaseDir()): TaskLeaseEnvironment {
  return fileLeaseRepository({ dir }).pipe(Layer.provideMerge(NodePlatformLive));
}

/**
 * One process-local lease repository built once and shared by every occupancy of one host object: a Layer built
 * per run would hand each occupancy an empty store, so same-process contenders could not see each other. The Node
 * platform is merged in, like the file repository does.
 */
export async function sharedMemoryTaskLeaseRepository(): Promise<TaskLeaseEnvironment> {
  const scope = await Effect.runPromise(Scope.make());
  const context = await Effect.runPromise(
    Effect.provideService(Layer.build(memoryLeaseRepository()), Scope.Scope, scope),
  );
  const repository = Context.get(context, LeaseRepository);
  return Layer.succeed(LeaseRepository, repository).pipe(Layer.provideMerge(NodePlatformLive));
}

/** The occupancy lease was lost: taken over, released, the record vanished, or no renewal was confirmed. */
export class TaskLeaseLostError extends Error {
  readonly key: string;
  readonly generation: number;
  readonly reason: LeaseLost['reason'];

  constructor(lost: LeaseLost) {
    super(`Occupancy lease ${lost.key} was lost (${lost.reason})`);
    this.name = 'TaskLeaseLostError';
    this.key = lost.key;
    this.generation = lost.generation;
    this.reason = lost.reason;
  }
}

/** The lease configuration is out of range, or the heartbeat does not fit twice into the TTL. */
export class TaskLeaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskLeaseConfigError';
  }
}

/** The lease repository could not read or write a record; the lease's state is unknown, not changed. */
export class TaskLeaseStoreError extends Error {
  readonly key: string;
  readonly reason: LeaseRepositoryFailure['reason'];

  constructor(failure: LeaseRepositoryFailure) {
    super(failure.message);
    this.name = 'TaskLeaseStoreError';
    this.key = failure.key;
    this.reason = failure.reason;
  }
}

function isTagged(error: unknown, tag: string): boolean {
  return typeof error === 'object' && error !== null && '_tag' in error && error._tag === tag;
}

/** Translates the kit's tagged lease errors into the Error surface the Promise side rejects with. */
export function toLeaseError(error: unknown, key: string): Error {
  if (isTagged(error, 'LeaseHeld')) {
    const held = error as LeaseHeld;
    return new OrchestrationConflictError(key, held.holder.pid);
  }
  if (isTagged(error, 'LeaseLost')) {
    return new TaskLeaseLostError(error as LeaseLost);
  }
  if (isTagged(error, 'FenceRejected')) {
    return new OrchestrationConflictError(key);
  }
  if (isTagged(error, 'LeaseConfigInvalid')) {
    return new TaskLeaseConfigError((error as { message: string }).message);
  }
  if (isTagged(error, 'LeaseRepositoryFailure')) {
    return new TaskLeaseStoreError(error as LeaseRepositoryFailure);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export interface OccupyTaskLeaseOptions {
  readonly key: string;
  readonly ttlMs?: number;
  readonly heartbeatMs?: number;
  readonly repository?: TaskLeaseEnvironment;
}

/** One held occupancy lease. The heartbeat runs on a fiber owned by the lease's scope; closing it releases the lease. */
export interface HeldTaskLease {
  readonly key: string;
  readonly generation: number;
  /** Settles once the lease is lost, with the error the Promise side rejects with. */
  readonly lost: Promise<TaskLeaseLostError>;
  /** True until a loss is observed or the lease is released. Fenced writes get the kit's own stronger check. */
  isHeld(): boolean;
  /** Runs one write under the per-key fence; an in-flight write settles before a successor's write starts. */
  runFenced<T>(work: () => Promise<T>): Promise<T>;
  /** Stops the heartbeat and releases the lease. */
  release(): Promise<void>;
}

/**
 * Takes the lease for `key` and keeps it fresh on a heartbeat fiber until {@link HeldTaskLease.release}.
 * Acquiring fails with {@link OrchestrationConflictError} while a live holder keeps the key; a dead holder is
 * taken over at once and a silent one after the TTL.
 */
export async function occupyTaskLease(options: OccupyTaskLeaseOptions): Promise<HeldTaskLease> {
  const scope = await Effect.runPromise(Scope.make());
  const releaseScope = () =>
    Effect.runPromise(Scope.close(scope, Exit.void)).then(
      () => undefined,
      () => undefined,
    );
  let handle: LeaseHandle;
  try {
    handle = await Effect.runPromise(
      Effect.provide(
        Effect.provideService(
          Effect.gen(function* () {
            const manager = yield* createLeaseManager({
              ttlMs: options.ttlMs ?? TASK_LEASE_TTL_MS,
              heartbeatMs: options.heartbeatMs ?? TASK_LEASE_HEARTBEAT_MS,
            });
            // The acquire joins `scope`, so its release finalizer runs when the lease is released.
            return yield* manager.acquire(options.key);
          }),
          Scope.Scope,
          scope,
        ),
        options.repository ?? fileTaskLeaseRepository(),
      ),
    );
  } catch (error) {
    await releaseScope();
    throw toLeaseError(error, options.key);
  }

  let loss: TaskLeaseLostError | undefined;
  let released = false;
  let notifyLoss: (error: TaskLeaseLostError) => void = () => undefined;
  const lost = new Promise<TaskLeaseLostError>((resolve) => {
    notifyLoss = resolve;
  });
  // The watcher lives on the lease's scope, so releasing interrupts it instead of leaking it. Losing the lease
  // completes `lost` first; the watcher's own end carries nothing.
  await Effect.runPromise(
    Effect.provideService(
      Effect.forkScoped(
        handle.lost.pipe(
          Effect.tapError((reason) =>
            Effect.sync(() => {
              loss = new TaskLeaseLostError(reason);
              notifyLoss(loss!);
            }),
          ),
          Effect.ignore,
        ),
      ),
      Scope.Scope,
      scope,
    ),
  ).catch(() => undefined);

  return {
    key: options.key,
    generation: handle.token.generation,
    lost,
    isHeld: () => loss === undefined && !released,
    runFenced: <T>(work: () => Promise<T>): Promise<T> =>
      Effect.runPromise(
        handle.runFenced(() =>
          Effect.uninterruptible(
            Effect.tryPromise({
              try: () => work(),
              catch: (cause) => cause,
            }),
          ),
        ),
      ).catch((error: unknown) => {
        throw toLeaseError(error, options.key);
      }),
    release: async () => {
      released = true;
      await releaseScope();
    },
  };
}
