import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import {
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationSeatError,
} from '../../orchestration/errors';
import {
  occupyTaskLease,
  sharedMemoryTaskLeaseRepository,
  TASK_LEASE_HEARTBEAT_MS,
  taskOrchestrationKey,
  type HeldTaskLease,
  type TaskLeaseEnvironment,
} from '../../orchestration/lease';
import { Run } from '../../orchestration/run';
import { TemplateRegistry } from '../../orchestration/template';
import type { ProcessRunner, SeatBind, TemplateSpec } from '../../orchestration/types';
import { MemoryOrchestrationStore } from '../../orchestration/memory-store';
import type { TaskDeliveryRuntime, TaskDeliveryRuntimeView } from '../application/task-delivery-ports';
import type { TaskDeliverySeat } from '../domain/model';

export const TASK_DELIVERY_TEMPLATE: TemplateSpec = {
  id: 'classic-delivery',
  seats: ['impl', 'review'],
  allow: { start: 'impl' },
};

export interface MemoryOrchestratedTaskRuntimeOptions {
  runner: ProcessRunner;
  bindings: Record<TaskDeliverySeat, SeatBind>;
  now?: () => number;
}

/** Memory-backed local adapter for Task occupancy and process execution. */
export class MemoryOrchestratedTaskRuntime implements TaskDeliveryRuntime {
  private readonly templates = new TemplateRegistry();
  private readonly state = new MemoryOrchestrationStore();
  private readonly leases = new Map<string, HeldTaskLease>();
  private readonly envs = new Map<string, Map<string, Record<string, string>>>();
  private readonly workspaces = new Map<string, string>();
  private readonly holderId = randomUUID();
  private repository: Promise<TaskLeaseEnvironment> | undefined;

  constructor(private readonly options: MemoryOrchestratedTaskRuntimeOptions) {
    this.templates.register(TASK_DELIVERY_TEMPLATE);
  }

  async open(input: { taskId: string; title: string }): Promise<void> {
    const key = taskOrchestrationKey(input.taskId);
    const template = this.templates.get(TASK_DELIVERY_TEMPLATE.id);
    const workDir = await mkdtemp(path.join(os.tmpdir(), 'rivus-room-task-'));
    try {
      // The aggregate is validated before the lease is taken, like the old facade.
      const run = Run.open({
        key,
        template,
        bind: this.options.bindings,
        context: { goal: input.title, ref: { taskId: input.taskId } },
        holder: { pid: process.pid, id: this.holderId },
        at: this.isoNow(),
      });
      // The lease is the occupancy proof; the run snapshot is this package's own state.
      const lease = await occupyTaskLease({
        key,
        heartbeatMs: TASK_LEASE_HEARTBEAT_MS,
        repository: await this.leaseRepository(),
      });
      this.leases.set(key, lease);
      this.envs.delete(key);
      for (const [seat, bound] of Object.entries(this.options.bindings)) {
        if (bound.env) {
          this.setEnv(key, seat, bound.env);
        }
      }
      this.state.writeState(run.snapshot());
      this.workspaces.set(input.taskId, workDir);
    } catch (error) {
      await rm(workDir, { recursive: true, force: true });
      throw error;
    }
  }

  fence<T>(taskId: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    return this.requireLease(taskOrchestrationKey(taskId)).runFenced(operation);
  }

  async run(input: {
    taskId: string;
    seat: TaskDeliverySeat;
    prompt: string;
  }): Promise<{ text: string; latencyMs: number }> {
    const key = taskOrchestrationKey(input.taskId);
    const workDir = this.workspaces.get(input.taskId);
    if (!workDir) {
      throw new Error(`Task ${input.taskId} has no active workspace`);
    }
    const held = this.requireHolder(key);
    const bound = held.run.requireAllowedSeat(input.seat);
    if (!bound.cmd) {
      throw new OrchestrationSeatError(key, `seat ${input.seat} has no command bound`);
    }
    const cmd = bound.cmd;
    const env = {
      ...this.envs.get(key)?.get(input.seat),
    };
    const args = [...(bound.args ?? []), input.prompt];

    this.mutateRun(key, (run) => run.markSeatRunning(input.seat));
    const lease = this.leases.get(key)!;
    const startedAt = (this.options.now ?? Date.now)();
    // Losing the lease interrupts the runner through its signal, like the old
    // heartbeat timer's abort; the seat state then belongs to the successor.
    const outcome = await Effect.runPromiseExit(
      Effect.raceFirst(
        Effect.tryPromise({
          try: (signal) =>
            this.options.runner({
              cmd,
              args,
              cwd: workDir,
              env,
              signal,
              onSpawn: (pid) => this.mutateRun(key, (run) => run.recordSeatPid(input.seat, pid)),
            }),
          catch: (cause) => cause,
        }),
        Effect.flatMap(
          Effect.tryPromise(() => lease.lost),
          (error) => Effect.fail(error),
        ),
      ),
    );
    if (Exit.isFailure(outcome)) {
      // best effort: the seat state belongs to the successor once the lease is lost
      try {
        this.mutateRun(key, (run) => run.markSeatExited(input.seat));
      } catch {
        // The new holder owns the run state after this lease is lost.
      }
      throw Cause.squash(outcome.cause);
    }
    const result = outcome.value;
    this.mutateRun(key, (run) => run.markSeatExited(input.seat));
    if (result.exitCode !== 0) {
      throw new Error(`${input.seat} exited with code ${result.exitCode}`);
    }
    if (!result.stdout.trim()) {
      throw new Error(`${input.seat} returned an empty response`);
    }
    return { text: result.stdout.trim(), latencyMs: (this.options.now ?? Date.now)() - startedAt };
  }

  allow(taskId: string, seat: TaskDeliverySeat): void {
    const key = taskOrchestrationKey(taskId);
    const held = this.requireHolder(key);
    held.run.allow(seat);
    this.touch(held);
  }

  appendFact(taskId: string, seat: TaskDeliverySeat, text: string): void {
    const key = taskOrchestrationKey(taskId);
    const held = this.requireHolder(key);
    held.run.appendFact(seat, text, this.isoNow());
    this.touch(held);
  }

  sendMail(taskId: string, input: { from: TaskDeliverySeat; to: TaskDeliverySeat; body: string }): void {
    const key = taskOrchestrationKey(taskId);
    const held = this.requireHolder(key);
    held.run.sendMail({ ...input, at: this.isoNow() });
    this.touch(held);
  }

  inspect(taskId: string): TaskDeliveryRuntimeView {
    const key = taskOrchestrationKey(taskId);
    const snapshot = this.state.readState(key);
    if (!snapshot) {
      throw new OrchestrationNotFoundError(key);
    }
    return {
      occupied: snapshot.occupied,
      allowedSeat: snapshot.allowed as TaskDeliverySeat,
    };
  }

  async release(taskId: string): Promise<void> {
    const key = taskOrchestrationKey(taskId);
    const lease = this.leases.get(key);
    if (!lease || !lease.isHeld()) {
      return;
    }
    const snapshot = this.state.readState(key);
    if (!snapshot || snapshot.holderId !== this.holderId) {
      return;
    }
    const run = Run.restore(snapshot);
    run.release(this.isoNow());
    // The released state lands before the lease goes, so a successor holder
    // can never see our stale write after it took over.
    this.state.writeState(run.snapshot());
    const workDir = this.workspaces.get(taskId);
    let releaseError: unknown;
    try {
      await lease.release();
    } catch (error) {
      releaseError = error;
    }
    this.leases.delete(key);
    if (workDir) {
      try {
        await rm(workDir, { recursive: true, force: true });
        this.workspaces.delete(taskId);
      } catch (error) {
        releaseError ??= error;
      }
    }
    if (releaseError) {
      throw releaseError;
    }
  }

  reset(): void {
    if (this.workspaces.size > 0) {
      throw new Error('cannot reset an occupied Task runtime');
    }
    for (const lease of this.leases.values()) {
      void lease.release();
    }
    this.leases.clear();
    this.envs.clear();
  }

  /** One process-local lease store for every occupancy this runtime ever takes. */
  private leaseRepository(): Promise<TaskLeaseEnvironment> {
    this.repository ??= sharedMemoryTaskLeaseRepository();
    return this.repository;
  }

  private requireLease(key: string): HeldTaskLease {
    const lease = this.leases.get(key);
    if (!lease) {
      throw new OrchestrationNotFoundError(key);
    }
    return lease;
  }

  /** The run state of one occupied key, refused unless this runtime still holds the lease. */
  private requireHolder(key: string): { run: Run } {
    const snapshot = this.state.readState(key);
    if (!snapshot || !snapshot.occupied) {
      throw new OrchestrationNotFoundError(key);
    }
    if (!this.requireLease(key).isHeld()) {
      throw new OrchestrationConflictError(key);
    }
    return { run: Run.restore(snapshot) };
  }

  private mutateRun(key: string, mutate: (run: Run) => void): void {
    const held = this.requireHolder(key);
    mutate(held.run);
    this.touch(held);
  }

  private touch(held: { run: Run }): void {
    const heartbeatAt = this.isoNow();
    held.run.heartbeat(heartbeatAt);
    const snapshot = held.run.snapshot();
    // The kit's heartbeat fiber owns the lease CAS; this write only lands while
    // this runtime still holds the lease.
    this.state.writeState(snapshot);
  }

  private setEnv(key: string, seat: string, env: Record<string, string>): void {
    const bySeat = this.envs.get(key) ?? new Map<string, Record<string, string>>();
    bySeat.set(seat, { ...env });
    this.envs.set(key, bySeat);
  }

  private isoNow(): string {
    return new Date((this.options.now ?? Date.now)()).toISOString();
  }
}
