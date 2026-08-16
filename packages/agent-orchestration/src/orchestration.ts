import {
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationSeatError,
} from './errors';
import { defaultBaseDir } from './paths';
import { FileOrchestrationStore, type LockRecord, type OrchestrationStore } from './store';
import { defaultProcessRunner } from './spawn';
import { TemplateRegistry } from './templates';
import type {
  ObservedRun,
  OpenRunInput,
  ProcessRunner,
  RunSnapshot,
  SeatBind,
  SeatState,
  SpawnResult,
} from './types';

export interface OrchestrationOptions {
  baseDir?: string;
  store?: OrchestrationStore;
  now?: () => number;
  staleAfterMs?: number;
  isProcessAlive?: (pid: number) => boolean;
  runner?: ProcessRunner;
}

export class Orchestration {
  readonly templates = new TemplateRegistry();
  private readonly store: OrchestrationStore;
  private readonly now: () => number;
  private readonly staleAfterMs: number;
  private readonly isProcessAlive: (pid: number) => boolean;
  private readonly runner: ProcessRunner;

  constructor(options: OrchestrationOptions = {}) {
    this.store = options.store ?? new FileOrchestrationStore(options.baseDir ?? defaultBaseDir());
    this.now = options.now ?? Date.now;
    this.staleAfterMs = options.staleAfterMs ?? 120_000;
    this.isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
    this.runner = options.runner ?? defaultProcessRunner;
  }

  async open(input: OpenRunInput): Promise<RunSnapshot> {
    const template = this.templates.get(input.template);
    const bind = input.bind ?? {};
    for (const seat of Object.keys(bind)) {
      if (!template.seats.includes(seat)) {
        throw new OrchestrationSeatError(input.key, `seat ${seat} is not in template ${template.id}`);
      }
    }

    this.acquire(input.key);

    const allowed = template.allow?.start ?? template.seats[0]!;
    const seats: Record<string, SeatState> = {};
    for (const name of template.seats) {
      const bound = bind[name];
      seats[name] = {
        ...(bound?.cmd ? { cmd: bound.cmd } : {}),
        ...(bound?.args ? { args: [...bound.args] } : {}),
        status: 'idle',
      };
      if (bound?.env) {
        this.envs.set(envKey(input.key, name), { ...bound.env });
      }
    }

    const snapshot: RunSnapshot = {
      key: input.key,
      template: template.id,
      seats,
      allowed,
      occupied: true,
      holderPid: process.pid,
      heartbeatAt: this.isoNow(),
      context: {
        ...(input.context?.goal ? { goal: input.context.goal } : {}),
        ...(input.context?.ref ? { ref: { ...input.context.ref } } : {}),
        facts: [],
        mail: [],
      },
    };
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
    const snapshot = this.inspect(key);
    const seats: ObservedRun['seats'] = {};
    for (const [name, seat] of Object.entries(snapshot.seats)) {
      seats[name] = { status: seat.status };
    }
    return {
      key: snapshot.key,
      template: snapshot.template,
      allowed: snapshot.allowed,
      seats,
      context: {
        ...(snapshot.context.goal ? { goal: snapshot.context.goal } : {}),
        ...(snapshot.context.ref ? { ref: { ...snapshot.context.ref } } : {}),
        facts: [...snapshot.context.facts],
        mail: [...snapshot.context.mail],
      },
    };
  }

  allow(key: string, seat: string): RunSnapshot {
    const snapshot = this.requireOccupied(key);
    if (!snapshot.seats[seat]) {
      throw new OrchestrationSeatError(key, `unknown seat ${seat}`);
    }
    snapshot.allowed = seat;
    snapshot.heartbeatAt = this.isoNow();
    this.touchLock(key);
    this.store.writeState(snapshot);
    return snapshot;
  }

  appendFact(key: string, seat: string, text: string): RunSnapshot {
    const snapshot = this.requireOccupied(key);
    if (!snapshot.seats[seat]) {
      throw new OrchestrationSeatError(key, `unknown seat ${seat}`);
    }
    snapshot.context.facts.push({ seat, text, at: this.isoNow() });
    snapshot.heartbeatAt = this.isoNow();
    this.touchLock(key);
    this.store.writeState(snapshot);
    return snapshot;
  }

  sendMail(key: string, input: { from: string; to: string; body: string }): RunSnapshot {
    const snapshot = this.requireOccupied(key);
    if (!snapshot.seats[input.from]) {
      throw new OrchestrationSeatError(key, `unknown seat ${input.from}`);
    }
    if (!snapshot.seats[input.to]) {
      throw new OrchestrationSeatError(key, `unknown seat ${input.to}`);
    }
    snapshot.context.mail.push({
      from: input.from,
      to: input.to,
      body: input.body,
      at: this.isoNow(),
    });
    snapshot.heartbeatAt = this.isoNow();
    this.touchLock(key);
    this.store.writeState(snapshot);
    return snapshot;
  }

  async spawn(
    key: string,
    seat: string,
    input: { cwd: string; extraArgs?: string[]; env?: Record<string, string> },
  ): Promise<SpawnResult> {
    const snapshot = this.requireOccupied(key);
    if (snapshot.allowed !== seat) {
      throw new OrchestrationSeatError(key, `seat ${seat} is not allowed to spawn (allowed=${snapshot.allowed})`);
    }
    const bound = snapshot.seats[seat];
    if (!bound?.cmd) {
      throw new OrchestrationSeatError(key, `seat ${seat} has no command bound`);
    }
    const env = { ...(this.envs.get(envKey(key, seat)) ?? {}), ...(input.env ?? {}) };
    const args = [...(bound.args ?? []), ...(input.extraArgs ?? [])];

    bound.status = 'running';
    snapshot.heartbeatAt = this.isoNow();
    this.store.writeState(snapshot);

    const result = await this.runner({
      cmd: bound.cmd,
      args,
      cwd: input.cwd,
      env,
      onSpawn: pid => {
        bound.pid = pid;
        snapshot.heartbeatAt = this.isoNow();
        this.touchLock(key);
        this.store.writeState(snapshot);
      },
    });

    bound.status = 'exited';
    snapshot.heartbeatAt = this.isoNow();
    this.touchLock(key);
    this.store.writeState(snapshot);
    return result;
  }

  heartbeat(key: string): void {
    const snapshot = this.requireOccupied(key);
    snapshot.heartbeatAt = this.isoNow();
    this.touchLock(key);
    this.store.writeState(snapshot);
  }

  release(key: string): void {
    const snapshot = this.store.readState(key);
    this.store.removeLock(key);
    if (!snapshot) {
      return;
    }
    snapshot.occupied = false;
    snapshot.holderPid = undefined;
    snapshot.heartbeatAt = this.isoNow();
    this.store.writeState(snapshot);
  }

  listRuns(): RunSnapshot[] {
    return this.store.listKeys().flatMap(key => {
      const snapshot = this.store.readState(key);
      return snapshot ? [snapshot] : [];
    });
  }

  /** Bind or replace a seat command after open (caller-owned; not an agent write). */
  bind(key: string, seat: string, bind: SeatBind): RunSnapshot {
    const snapshot = this.requireOccupied(key);
    if (!snapshot.seats[seat]) {
      throw new OrchestrationSeatError(key, `unknown seat ${seat}`);
    }
    snapshot.seats[seat] = {
      ...snapshot.seats[seat],
      cmd: bind.cmd,
      ...(bind.args ? { args: [...bind.args] } : {}),
    };
    if (bind.env) {
      this.envs.set(envKey(key, seat), { ...bind.env });
    }
    this.store.writeState(snapshot);
    return snapshot;
  }

  private readonly envs = new Map<string, Record<string, string>>();

  private acquire(key: string): void {
    const record: LockRecord = {
      key,
      holderPid: process.pid,
      heartbeatAt: this.isoNow(),
    };
    if (this.store.tryCreateLock(key, record)) {
      return;
    }
    const existing = this.store.readLock(key);
    if (existing && this.isFresh(existing)) {
      throw new OrchestrationConflictError(key, existing.holderPid);
    }
    this.store.removeLock(key);
    if (!this.store.tryCreateLock(key, record)) {
      const raced = this.store.readLock(key);
      throw new OrchestrationConflictError(key, raced?.holderPid);
    }
  }

  private isFresh(lock: LockRecord): boolean {
    if (!this.isProcessAlive(lock.holderPid)) {
      return false;
    }
    const at = Date.parse(lock.heartbeatAt);
    if (Number.isNaN(at)) {
      return false;
    }
    return this.now() - at <= this.staleAfterMs;
  }

  private requireOccupied(key: string): RunSnapshot {
    const snapshot = this.inspect(key);
    if (!snapshot.occupied) {
      throw new OrchestrationNotFoundError(key);
    }
    return snapshot;
  }

  private touchLock(key: string): void {
    this.store.writeLock(key, {
      key,
      holderPid: process.pid,
      heartbeatAt: this.isoNow(),
    });
  }

  private isoNow(): string {
    return new Date(this.now()).toISOString();
  }
}

function envKey(runKey: string, seat: string): string {
  return `${runKey}::${seat}`;
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
