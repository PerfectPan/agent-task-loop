import type { Store } from '../contracts/store';
import type { ChannelEntry, Clock, ProcessLiveness, SeatBind, SpawnPermit, TemplateSpec } from '../contracts/types';
import { OrchestrationConflictError, OrchestrationNotFoundError, OrchestrationTemplateError } from '../domain/errors';
import { Run, type DomainEvent } from '../domain/run';
import { defineTemplate, sameTemplate, type Template } from '../domain/template';

export interface CommandDeps {
  store: Store;
  clock: Clock;
  liveness: ProcessLiveness;
  supervisorPid: number | null;
  staleAfterMs: number;
}

export class CommandHandler {
  constructor(private readonly deps: CommandDeps) {}

  open(input: {
    key: string;
    template: string;
    bind?: Record<string, SeatBind>;
    ref?: Record<string, string>;
    goal?: string;
  }): { snapshot: ReturnType<Run['snapshot']>; code?: string; metric?: string } {
    return this.deps.store.withTransaction(tx => {
      const template = requireTemplate(tx, input.template);
      const existing = loadRun(tx, input.key, template);
      const now = iso(this.deps.clock.now());
      const occupancy = {
        nowMs: this.deps.clock.now(),
        staleAfterMs: this.deps.staleAfterMs,
        isAlive: (pid: number) => this.deps.liveness.isAlive(pid),
      };
      const refJson = input.ref ? JSON.stringify(input.ref) : null;
      if (!existing) {
        const created = Run.createFirst({
          key: input.key,
          template,
          bind: input.bind,
          goal: input.goal,
          refJson,
          supervisorPid: this.deps.supervisorPid,
          now,
        });
        insertRun(tx, created.run, created.events, now);
        return { snapshot: requireRun(tx, input.key).snapshot() };
      }
      const { events, outcome } = existing.openAgain({
        template,
        bind: input.bind,
        goal: input.goal,
        refJson,
        supervisorPid: this.deps.supervisorPid,
        now,
        occupancy,
      });
      saveRun(tx, existing, events, now);
      return {
        snapshot: requireRun(tx, input.key).snapshot(),
        ...(outcome === 'stale-takeover'
          ? { code: 'stale-takeover', metric: 'orch_stale_takeover_total' }
          : outcome === 'reopen'
            ? { code: 'reopen' }
            : {}),
      };
    });
  }

  join(input: { key: string; seat: string; bind?: SeatBind }): ReturnType<Run['snapshot']> {
    return this.mutate(input.key, (run, now) => [run.join(input.seat, input.bind, now)]);
  }

  leave(input: { key: string; seat: string }): ReturnType<Run['snapshot']> {
    return this.mutate(input.key, (run, now) => [run.leave(input.seat, now)]);
  }

  grant(input: {
    key: string;
    seat: string;
    expectedTerm: number;
    partition?: string;
    revokeSeat?: string;
  }): ReturnType<Run['snapshot']> {
    return this.mutate(input.key, (run, now) => [
      run.grant({
        seat: input.seat,
        expectedTerm: input.expectedTerm,
        partition: input.partition,
        revokeSeat: input.revokeSeat,
        now,
      }),
    ]);
  }

  pass(input: {
    key: string;
    from: string;
    to: string;
    expectedTerm: number;
    partition?: string;
  }): ReturnType<Run['snapshot']> {
    return this.mutate(input.key, (run, now) => [
      run.pass({
        from: input.from,
        to: input.to,
        expectedTerm: input.expectedTerm,
        partition: input.partition,
        now,
      }),
    ]);
  }

  heartbeat(input: { key: string }): void {
    this.deps.store.touchHeartbeat(input.key, iso(this.deps.clock.now()));
  }

  send(input: {
    key: string;
    from: string;
    to: string | null;
    mailKind: string;
    body: string;
  }): ChannelEntry {
    return this.deps.store.withTransaction(tx => {
      const run = requireOpenRun(tx, input.key);
      const now = iso(this.deps.clock.now());
      const event = run.send(input);
      const [entry] = persistEvents(tx, run, [event], now);
      return entry!;
    });
  }

  authorizeSpawn(input: { key: string; seat: string; expectedTerm: number }): SpawnPermit {
    return this.deps.store.withTransaction(tx => {
      const run = requireOpenRun(tx, input.key);
      const now = iso(this.deps.clock.now());
      const { event, permit } = run.authorizeSpawn(input.seat, input.expectedTerm, now);
      const [entry] = persistEvents(tx, run, [event], now);
      return { ...permit, idx: entry!.idx };
    });
  }

  release(input: { key: string }): void {
    this.deps.store.withTransaction(tx => {
      const row = tx.getRun(input.key);
      if (!row || row.status === 'released') {
        return;
      }
      const run = requireRun(tx, input.key);
      const now = iso(this.deps.clock.now());
      const event = run.release(now);
      saveRun(tx, run, event ? [event] : [], now);
    });
  }

  markInboxRead(input: { key: string; seat: string; idx: number }): void {
    this.deps.store.setCursor(input.key, input.seat, input.idx);
  }

  registerTemplate(spec: TemplateSpec): TemplateSpec {
    const template = defineTemplate(spec);
    return this.deps.store.withTransaction(tx => {
      const existing = tx.getTemplate(template.id);
      if (existing) {
        if (!sameTemplate(existing, template)) {
          throw new OrchestrationTemplateError(`template ${template.id} is already registered`);
        }
        return toSpec(existing);
      }
      tx.upsertTemplate(template, iso(this.deps.clock.now()));
      return toSpec(template);
    });
  }

  private mutate(key: string, fn: (run: Run, now: string) => DomainEvent[]): ReturnType<Run['snapshot']> {
    return this.deps.store.withTransaction(tx => {
      const run = requireOpenRun(tx, key);
      const now = iso(this.deps.clock.now());
      const events = fn(run, now);
      saveRun(tx, run, events, now);
      return requireRun(tx, key).snapshot();
    });
  }
}

function loadRun(tx: Store, key: string, template?: Template): Run | undefined {
  const row = tx.getRun(key);
  if (!row) {
    return undefined;
  }
  const resolved = template ?? requireTemplate(tx, row.templateId);
  return Run.rehydrate({
    key: row.key,
    template: resolved,
    term: row.term,
    maxTokens: row.maxTokens,
    status: row.status,
    supervisorPid: row.supervisorPid,
    lastHeartbeatAt: row.lastHeartbeatAt,
    lastIndex: row.lastIndex,
    goal: row.goal,
    refJson: row.refJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    members: tx.listMembers(key),
    tokens: tx.listTokens(key),
  });
}

function requireRun(tx: Store, key: string): Run {
  const run = loadRun(tx, key);
  if (!run) {
    throw new OrchestrationNotFoundError(key);
  }
  return run;
}

function requireOpenRun(tx: Store, key: string): Run {
  const run = requireRun(tx, key);
  if (run.status !== 'open') {
    throw new OrchestrationNotFoundError(key);
  }
  return run;
}

function requireTemplate(tx: Store, id: string): Template {
  const template = tx.getTemplate(id);
  if (!template) {
    throw new OrchestrationTemplateError(`unknown template ${id}`);
  }
  return template;
}

function insertRun(tx: Store, run: Run, events: DomainEvent[], now: string): void {
  const row = run.persistence();
  const inserted = tx.insertRun({
    key: row.key,
    templateId: row.templateId,
    term: row.term,
    maxTokens: row.maxTokens,
    status: row.status,
    supervisorPid: row.supervisorPid,
    lastHeartbeatAt: row.lastHeartbeatAt,
    lastIndex: 0,
    goal: row.goal,
    refJson: row.refJson,
    createdAt: row.createdAt,
    updatedAt: now,
  });
  if (!inserted) {
    const raced = tx.getRun(row.key);
    throw new OrchestrationConflictError(row.key, raced?.supervisorPid ?? undefined);
  }
  for (const member of row.members) {
    tx.upsertMember(row.key, member);
  }
  persistEvents(tx, run, events, now);
}

function saveRun(tx: Store, run: Run, events: DomainEvent[], now: string): void {
  const before = tx.getRun(run.key);
  if (!before) {
    throw new OrchestrationNotFoundError(run.key);
  }
  const row = run.persistence();
  if (
    !tx.casRun(run.key, before.term, {
      term: row.term,
      status: row.status,
      supervisorPid: row.supervisorPid,
      lastHeartbeatAt: row.lastHeartbeatAt,
      goal: row.goal,
      refJson: row.refJson,
      updatedAt: now,
    })
  ) {
    throw new OrchestrationConflictError(run.key, before.supervisorPid ?? undefined);
  }
  syncMembers(tx, row.key, row.members);
  syncTokens(tx, row.key, row.tokens);
  persistEvents(tx, run, events, now);
}

function persistEvents(tx: Store, run: Run, events: DomainEvent[], createdAt: string): ChannelEntry[] {
  return events.map(event =>
    tx.appendChannel({
      key: run.key,
      term: event.term,
      kind: event.kind,
      mailKind: event.mailKind,
      fromSeat: event.fromSeat,
      toSeat: event.toSeat,
      body: event.body,
      createdAt,
    }),
  );
}

function syncMembers(tx: Store, key: string, members: ReturnType<Run['persistence']>['members']): void {
  for (const member of members) {
    tx.upsertMember(key, member);
  }
}

function syncTokens(tx: Store, key: string, tokens: ReturnType<Run['persistence']>['tokens']): void {
  tx.clearTokens(key);
  for (const token of tokens) {
    tx.insertToken(key, token.seat, token.partition);
  }
}

function toSpec(template: Template): TemplateSpec {
  return {
    id: template.id,
    seats: [...template.seats],
    ...(template.startSeat ? { startSeat: template.startSeat } : {}),
    maxTokens: template.maxTokens,
    ...(template.mail.length > 0 ? { mail: template.mail.map(route => ({ ...route })) } : {}),
  };
}

function iso(now: number): string {
  return new Date(now).toISOString();
}
