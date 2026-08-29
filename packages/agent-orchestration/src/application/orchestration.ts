import {
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationSeatError,
} from '../contracts/errors';
import type {
  Clock,
  IntervalScheduler,
  LockRecord,
  OrchestrationStore,
  ProcessIdentity,
  ProcessLiveness,
} from '../contracts/ports';
import type {
  OpenRunInput,
  ObservedRun,
  ProcessRunner,
  RunSnapshot,
  SeatBind,
  SeatState,
  SpawnResult,
} from '../contracts/types';
import { holdsLock, isLockFresh } from '../domain/lock';
import { observeRun, occupiedSnapshot, releasedSnapshot, requireSeat } from '../domain/run';
import { TemplateRegistry } from '../domain/template';

export interface OrchestrationDependencies {
  store: OrchestrationStore;
  clock: Clock;
  identity: ProcessIdentity;
  liveness: ProcessLiveness;
  runner: ProcessRunner;
  scheduler: IntervalScheduler;
  staleAfterMs?: number;
  heartbeatIntervalMs?: number;
}

export class Orchestration {
  readonly templates = new TemplateRegistry();
  private readonly store: OrchestrationStore;
  private readonly clock: Clock;
  private readonly identity: ProcessIdentity;
  private readonly liveness: ProcessLiveness;
  private readonly runner: ProcessRunner;
  private readonly scheduler: IntervalScheduler;
  private readonly staleAfterMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly envs = new Map<string, Record<string, string>>();

  constructor(dependencies: OrchestrationDependencies) {
    this.store = dependencies.store;
    this.clock = dependencies.clock;
    this.identity = dependencies.identity;
    this.liveness = dependencies.liveness;
    this.runner = dependencies.runner;
    this.scheduler = dependencies.scheduler;
    this.staleAfterMs = dependencies.staleAfterMs ?? 120_000;
    this.heartbeatIntervalMs =
      dependencies.heartbeatIntervalMs ?? Math.min(15_000, Math.max(1, Math.floor(this.staleAfterMs / 4)));
  }

  async open(input: OpenRunInput): Promise<RunSnapshot> {
    const template = this.templates.get(input.template);
    this.acquire(input.key);
    this.clearEnvs(input.key);

    const snapshot = occupiedSnapshot({
      key: input.key,
      template,
      bind: input.bind,
      context: input.context,
      holderPid: this.identity.pid,
      at: this.isoNow(),
    });
    for (const [seat, bound] of Object.entries(input.bind ?? {})) {
      if (bound.env) {
        this.envs.set(envKey(input.key, seat), { ...bound.env });
      }
    }
    this.store.writeState(snapshot);
    return snapshot;
  }

  inspect(key: string): RunSnapshot {
    const snapshot = this.store.readState(key);
    if (!snapshot) {
      throw new OrchestrationNotFoundError(key);
    }
    return snapshot;
  }

  observe(key: string, _seat: string): ObservedRun {
    return observeRun(this.inspect(key));
  }

  allow(key: string, seat: string): RunSnapshot {
    const snapshot = this.requireHolder(key);
    requireSeat(snapshot, seat);
    snapshot.allowed = seat;
    return this.touch(snapshot);
  }

  appendFact(key: string, seat: string, text: string): RunSnapshot {
    const snapshot = this.requireHolder(key);
    requireSeat(snapshot, seat);
    snapshot.context.facts.push({ seat, text, at: this.isoNow() });
    return this.touch(snapshot);
  }

  sendMail(key: string, input: { from: string; to: string; body: string }): RunSnapshot {
    const snapshot = this.requireHolder(key);
    requireSeat(snapshot, input.from);
    requireSeat(snapshot, input.to);
    snapshot.context.mail.push({
      from: input.from,
      to: input.to,
      body: input.body,
      at: this.isoNow(),
    });
    return this.touch(snapshot);
  }

  async spawn(
    key: string,
    seat: string,
    input: { cwd: string; extraArgs?: string[]; env?: Record<string, string> },
  ): Promise<SpawnResult> {
    const snapshot = this.requireHolder(key);
    if (snapshot.allowed !== seat) {
      throw new OrchestrationSeatError(key, `seat ${seat} is not allowed to spawn (allowed=${snapshot.allowed})`);
    }
    const bound = requireSeat(snapshot, seat);
    if (!bound.cmd) {
      throw new OrchestrationSeatError(key, `seat ${seat} has no command bound`);
    }
    const env = { ...(this.envs.get(envKey(key, seat)) ?? {}), ...(input.env ?? {}) };
    const args = [...(bound.args ?? []), ...(input.extraArgs ?? [])];

    this.patchSeat(key, seat, seatState => {
      seatState.status = 'running';
    });

    const timer = this.scheduler.setInterval(() => {
      try {
        this.heartbeat(key);
      } catch {
        // Holder lost the lock; the interval is cleared in finally.
      }
    }, this.heartbeatIntervalMs);
    timer.unref?.();

    try {
      const result = await this.runner({
        cmd: bound.cmd,
        args,
        cwd: input.cwd,
        env,
        onSpawn: pid => {
          this.patchSeat(key, seat, seatState => {
            seatState.pid = pid;
          });
        },
      });
      this.patchSeat(key, seat, seatState => {
        seatState.status = 'exited';
        delete seatState.pid;
      });
      return result;
    } catch (error) {
      try {
        this.patchSeat(key, seat, seatState => {
          seatState.status = 'exited';
          delete seatState.pid;
        });
      } catch {
        // Lock was stolen or released while the child ran.
      }
      throw error;
    } finally {
      this.scheduler.clearInterval(timer);
    }
  }

  heartbeat(key: string): void {
    this.touch(this.requireHolder(key));
  }

  release(key: string): void {
    const lock = this.store.readLock(key);
    if (!lock || lock.holderPid !== this.identity.pid) {
      return;
    }
    this.store.removeLock(key);
    this.clearEnvs(key);
    const snapshot = this.store.readState(key);
    if (!snapshot) {
      return;
    }
    this.store.writeState(releasedSnapshot(snapshot, this.isoNow()));
  }

  listRuns(): RunSnapshot[] {
    return this.store.listKeys().flatMap(key => {
      const snapshot = this.store.readState(key);
      return snapshot ? [snapshot] : [];
    });
  }

  bind(key: string, seat: string, bind: SeatBind): RunSnapshot {
    const snapshot = this.requireHolder(key);
    const seatState = requireSeat(snapshot, seat);
    snapshot.seats[seat] = {
      ...seatState,
      cmd: bind.cmd,
      ...(bind.args ? { args: [...bind.args] } : {}),
    };
    if (bind.env) {
      this.envs.set(envKey(key, seat), { ...bind.env });
    } else {
      this.envs.delete(envKey(key, seat));
    }
    return this.touch(snapshot);
  }

  private acquire(key: string): void {
    const record: LockRecord = {
      key,
      holderPid: this.identity.pid,
      heartbeatAt: this.isoNow(),
    };
    if (this.store.tryCreateLock(key, record)) {
      return;
    }
    const existing = this.store.readLock(key);
    if (!existing) {
      if (this.store.lockExists(key)) {
        throw new OrchestrationConflictError(key);
      }
      if (this.store.tryCreateLock(key, record)) {
        return;
      }
      const raced = this.store.readLock(key);
      throw new OrchestrationConflictError(key, raced?.holderPid);
    }
    if (isLockFresh(existing, this.clock.now(), this.staleAfterMs, pid => this.liveness.isAlive(pid))) {
      throw new OrchestrationConflictError(key, existing.holderPid);
    }
    if (!this.store.tryReplaceLock(key, existing, record)) {
      const raced = this.store.readLock(key);
      throw new OrchestrationConflictError(key, raced?.holderPid);
    }
  }

  private requireHolder(key: string): RunSnapshot {
    const snapshot = this.inspect(key);
    if (!snapshot.occupied) {
      throw new OrchestrationNotFoundError(key);
    }
    const lock = this.store.readLock(key);
    if (!holdsLock(lock, this.identity.pid, this.clock.now(), this.staleAfterMs, pid => this.liveness.isAlive(pid))) {
      throw new OrchestrationConflictError(key, lock?.holderPid);
    }
    return snapshot;
  }

  private patchSeat(key: string, seat: string, patch: (seat: SeatState) => void): void {
    const snapshot = this.requireHolder(key);
    patch(requireSeat(snapshot, seat));
    this.touch(snapshot);
  }

  private touch(snapshot: RunSnapshot): RunSnapshot {
    snapshot.heartbeatAt = this.isoNow();
    this.store.writeLock(snapshot.key, {
      key: snapshot.key,
      holderPid: this.identity.pid,
      heartbeatAt: snapshot.heartbeatAt,
    });
    this.store.writeState(snapshot);
    return snapshot;
  }

  private clearEnvs(key: string): void {
    const prefix = `${key}::`;
    for (const name of [...this.envs.keys()]) {
      if (name.startsWith(prefix)) {
        this.envs.delete(name);
      }
    }
  }

  private isoNow(): string {
    return new Date(this.clock.now()).toISOString();
  }
}

function envKey(runKey: string, seat: string): string {
  return `${runKey}::${seat}`;
}
