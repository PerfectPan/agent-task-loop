import { createLeaseManager } from '@rivus/agent-kit-collab/lease';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import {
  fileTaskLeaseRepository,
  TASK_LEASE_HEARTBEAT_MS,
  TASK_LEASE_TTL_MS,
  taskOrchestrationKey,
  toLeaseError,
  type TaskLeaseEnvironment,
} from '../orchestration/lease';
import { OrchestrationConflictError } from '../orchestration/errors';
import type { TaskMutationFence } from '../services/task-service';

export interface TaskOccupancyContext {
  signal: AbortSignal;
  mutationFence: TaskMutationFence;
}

/** One occupied Task run, from taking the lease to releasing it. */
export interface TaskOccupancy {
  run<T>(input: { taskId: string; goal?: string }, workflow: (context: TaskOccupancyContext) => Promise<T>): Promise<T>;
}

export interface TaskOccupancyOptions {
  /** Where lease records live; defaults to the file repository under the default per-key directory. */
  repository?: TaskLeaseEnvironment;
  /** How often the lease renews. Two renewals must fit in the TTL, so one late heartbeat does not lose it. */
  heartbeatMs?: number;
}

/**
 * Owns the lifecycle and external-write fence for one occupied Task run.
 *
 * The lease itself is `@rivus/agent-kit-collab`'s `/lease`: a scoped
 * `manager.acquire` keeps the heartbeat fiber alive for the workflow and
 * releases the lease when the scope closes, and `handle.lost` replaces the old
 * heartbeat-error abort. Task policy stays in the application.
 */
export class TaskOccupancyService implements TaskOccupancy {
  private readonly repository: TaskLeaseEnvironment;
  private readonly heartbeatMs: number;

  constructor(options: TaskOccupancyOptions = {}) {
    this.repository = options.repository ?? fileTaskLeaseRepository();
    this.heartbeatMs = options.heartbeatMs ?? TASK_LEASE_HEARTBEAT_MS;
  }

  async run<T>(
    input: { taskId: string; goal?: string },
    workflow: (context: TaskOccupancyContext) => Promise<T>,
  ): Promise<T> {
    const key = taskOrchestrationKey(input.taskId);
    const heartbeatMs = this.heartbeatMs;
    const program = Effect.gen(function* () {
      const manager = yield* createLeaseManager({
        ttlMs: TASK_LEASE_TTL_MS,
        heartbeatMs,
      });
      const handle = yield* manager.acquire(key).pipe(
        Effect.mapError((error) => {
          const mapped = toLeaseError(error, key);
          if (mapped instanceof OrchestrationConflictError) {
            return new Error(
              `Task ${input.taskId} already has an active orchestration` +
                (mapped.holderPid !== undefined ? ` (pid ${mapped.holderPid})` : ''),
            );
          }
          return mapped;
        }),
      );
      const mutationFence: TaskMutationFence = {
        // An in-flight write settles before the fence opens for a successor, so
        // a successor can never start newer state that the old write could
        // later overwrite; the write itself observes the abort signal.
        run: (mutation) =>
          Effect.runPromise(
            handle.runFenced(() =>
              Effect.uninterruptible(
                Effect.tryPromise({
                  try: () => mutation(),
                  catch: (cause) => cause,
                }),
              ),
            ),
          ).catch((error: unknown) => {
            throw toLeaseError(error, key);
          }),
      };
      // The lease is lost while the workflow runs: the workflow's signal aborts
      // (interruption) and the run fails with the loss instead of its result.
      return yield* Effect.raceFirst(
        Effect.tryPromise({
          try: (signal) => workflow({ signal, mutationFence }),
          catch: (cause) => cause,
        }),
        handle.lost,
      );
    });

    const exit = await Effect.runPromiseExit(Effect.scoped(Effect.provide(program, this.repository)));
    if (Exit.isFailure(exit)) {
      throw toLeaseError(Cause.squash(exit.cause), key);
    }
    return exit.value;
  }
}
