import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createOrchestration,
  OrchestrationConflictError,
  OrchestrationSeatError,
  OrchestrationTemplateError,
  OrchestrationUnauthorizedError,
  OrchestrationValidationError,
  RecordingLogger,
  silentLogger,
  type Orchestration,
} from '../src/index';
import { closeOrchestration } from '../src/infrastructure/node-factory';

const dirs: string[] = [];
const open: Orchestration[] = [];

afterEach(() => {
  for (const orch of open.splice(0)) {
    closeOrchestration(orch);
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-orch-'));
  dirs.push(dir);
  return dir;
}

function dbFile(): string {
  return path.join(tempDir(), 'orchestration.db');
}

function connect(dbPath: string, options: Parameters<typeof createOrchestration>[0] = {}): Orchestration {
  const orch = createOrchestration({ dbPath, logger: silentLogger, ...options });
  open.push(orch);
  return orch;
}

function classic(orch: Orchestration, extra: { maxTokens?: number; seats?: string[] } = {}): void {
  orch.templates.register({
    id: extra.maxTokens || extra.seats ? 'parallel' : 'classic-delivery',
    seats: extra.seats ?? ['impl', 'review'],
    startSeat: 'impl',
    ...(extra.maxTokens ? { maxTokens: extra.maxTokens } : {}),
  });
}

describe('templates', () => {
  it('registers the same spec idempotently even when seats and mail are reordered', () => {
    const orch = connect(':memory:');
    const first = orch.templates.register({
      id: 'classic-delivery',
      seats: ['impl', 'review'],
      startSeat: 'impl',
      maxTokens: 1,
      mail: [
        { from: 'impl', to: 'review', kind: 'review-request' },
        { from: 'review', to: 'impl', kind: 'review-verdict' },
      ],
    });
    const again = orch.templates.register({
      id: 'classic-delivery',
      seats: ['review', 'impl'],
      startSeat: 'impl',
      maxTokens: 1,
      mail: [
        { from: 'review', to: 'impl', kind: 'review-verdict' },
        { from: 'impl', to: 'review', kind: 'review-request' },
      ],
    });
    expect(again).toEqual(first);
    expect(orch.templates.list()).toHaveLength(1);
  });

  it('rejects a conflicting spec and a start seat that is not in the roster', () => {
    const orch = connect(':memory:');
    orch.templates.register({ id: 'classic-delivery', seats: ['impl', 'review'], startSeat: 'impl' });
    expect(() =>
      orch.templates.register({ id: 'classic-delivery', seats: ['impl', 'review'], startSeat: 'review' }),
    ).toThrow(OrchestrationTemplateError);
    expect(() =>
      orch.templates.register({ id: 'bad', seats: ['impl'], startSeat: 'lead' }),
    ).toThrow(/start seat/);
  });
});

describe('open / occupy', () => {
  it('opens a run with empty tokens and records join rows', () => {
    const orch = connect(':memory:');
    classic(orch);
    const snapshot = orch.open({
      key: 'task:T-1',
      template: 'classic-delivery',
      bind: { impl: { cmd: 'claude' } },
      goal: 'fix the leak',
      ref: { taskId: 'T-1' },
    });
    expect(snapshot.status).toBe('open');
    expect(snapshot.term).toBe(0);
    expect(snapshot.tokens).toEqual([]);
    expect(snapshot.maxTokens).toBe(1);
    expect(snapshot.members.map(member => member.seat)).toEqual(['impl', 'review']);
    expect(snapshot.lastHeartbeatAt).toBeTruthy();
    const page = orch.channel({ key: 'task:T-1', fromIndex: 1 });
    expect(page.entries.map(entry => entry.kind)).toEqual(['open', 'join', 'join']);
    expect(JSON.stringify(snapshot)).not.toContain('claude');
  });

  it('rejects a second open on the same key while the lock is fresh', () => {
    const file = dbFile();
    const a = connect(file, { supervisorPid: 11 });
    const b = connect(file, { supervisorPid: 22, isProcessAlive: () => true });
    classic(a);
    classic(b);
    a.open({ key: 'task:T-1', template: 'classic-delivery' });
    expect(() => b.open({ key: 'task:T-1', template: 'classic-delivery' })).toThrow(
      OrchestrationConflictError,
    );
    try {
      b.open({ key: 'task:T-1', template: 'classic-delivery' });
    } catch (error) {
      expect(error).toMatchObject({
        name: 'OrchestrationConflictError',
        code: 'orchestration-conflict',
        key: 'task:T-1',
        supervisorPid: 11,
      });
    }
  });

  it('lets a later open take over a stale lock without appending channel rows', () => {
    let now = 1_000;
    const file = dbFile();
    const a = connect(file, {
      now: () => now,
      staleAfterMs: 100,
      isProcessAlive: () => false,
      supervisorPid: 11,
    });
    classic(a);
    a.open({ key: 'task:T-1', template: 'classic-delivery' });
    const before = a.channel({ key: 'task:T-1', fromIndex: 1 });
    now = 10_000;
    const b = connect(file, {
      now: () => now,
      staleAfterMs: 100,
      isProcessAlive: () => false,
      supervisorPid: 22,
    });
    classic(b);
    const snapshot = b.open({ key: 'task:T-1', template: 'classic-delivery' });
    const after = b.channel({ key: 'task:T-1', fromIndex: 1 });
    expect(snapshot.status).toBe('open');
    expect(snapshot.term).toBe(0);
    expect(snapshot.tokens).toEqual([]);
    expect(snapshot.lastIndex).toBe(before.lastIndex);
    expect(after.entries).toHaveLength(before.entries.length);
    expect(snapshot.lastHeartbeatAt).not.toBe(before.entries[0]?.createdAt);
  });

  it('rewrites channel on released reopen by 1 + joined seats', () => {
    const orch = connect(':memory:');
    classic(orch);
    const first = orch.open({ key: 'task:T-1', template: 'classic-delivery' });
    orch.release({ key: 'task:T-1' });
    expect(orch.snapshot({ key: 'task:T-1' }).status).toBe('released');
    const again = orch.open({ key: 'task:T-1', template: 'classic-delivery' });
    expect(again.status).toBe('open');
    expect(again.term).toBe(1);
    expect(again.tokens).toEqual([]);
    expect(again.lastIndex).toBe(first.lastIndex + 1 + 1 + 2);
    const kinds = orch.channel({ key: 'task:T-1', fromIndex: first.lastIndex + 1 }).entries.map(
      entry => entry.kind,
    );
    expect(kinds).toEqual(['release', 'open', 'join', 'join']);
  });
});

describe('grant / pass / tokens', () => {
  it('yanks the only token when maxTokens is 1', () => {
    const orch = connect(':memory:');
    classic(orch);
    orch.open({ key: 'task:T-1', template: 'classic-delivery' });
    const granted = orch.grant({ key: 'task:T-1', seat: 'impl', expectedTerm: 0 });
    expect(granted.term).toBe(1);
    expect(granted.tokens).toEqual([{ seat: 'impl', partition: '' }]);
    const yanked = orch.grant({ key: 'task:T-1', seat: 'review', expectedTerm: 1 });
    expect(yanked.term).toBe(2);
    expect(yanked.tokens).toEqual([{ seat: 'review', partition: '' }]);
  });

  it('allows maxTokens concurrent grants and refuses a third without revokeSeat', () => {
    const orch = connect(':memory:');
    classic(orch, { maxTokens: 2, seats: ['impl', 'review', 'extra'] });
    orch.open({ key: 'run:1', template: 'parallel' });
    orch.grant({ key: 'run:1', seat: 'impl', expectedTerm: 0 });
    const two = orch.grant({ key: 'run:1', seat: 'review', expectedTerm: 1 });
    expect(two.tokens.map(token => token.seat).sort()).toEqual(['impl', 'review']);
    expect(() => orch.grant({ key: 'run:1', seat: 'extra', expectedTerm: 2 })).toThrow(
      OrchestrationConflictError,
    );
    const revoked = orch.grant({
      key: 'run:1',
      seat: 'extra',
      expectedTerm: 2,
      revokeSeat: 'impl',
    });
    expect(revoked.tokens.map(token => token.seat).sort()).toEqual(['extra', 'review']);
  });

  it('passes a held token and refuses pass from a non-holder', () => {
    const orch = connect(':memory:');
    classic(orch);
    orch.open({ key: 'task:T-1', template: 'classic-delivery' });
    orch.grant({ key: 'task:T-1', seat: 'impl', expectedTerm: 0 });
    expect(() =>
      orch.pass({ key: 'task:T-1', from: 'review', to: 'impl', expectedTerm: 1 }),
    ).toThrow(OrchestrationSeatError);
    const passed = orch.pass({ key: 'task:T-1', from: 'impl', to: 'review', expectedTerm: 1 });
    expect(passed.term).toBe(2);
    expect(passed.tokens).toEqual([{ seat: 'review', partition: '' }]);
  });

  it('leaves a holder without bumping term', () => {
    const orch = connect(':memory:');
    classic(orch);
    orch.open({ key: 'task:T-1', template: 'classic-delivery' });
    orch.grant({ key: 'task:T-1', seat: 'impl', expectedTerm: 0 });
    const left = orch.leave({ key: 'task:T-1', seat: 'impl' });
    expect(left.term).toBe(1);
    expect(left.tokens).toEqual([]);
    expect(left.members.find(member => member.seat === 'impl')?.status).toBe('left');
  });
});

describe('send / inbox / authorizeSpawn', () => {
  it('preserves mailKind and does not change tokens', () => {
    const orch = connect(':memory:');
    classic(orch);
    orch.open({ key: 'task:T-1', template: 'classic-delivery' });
    orch.grant({ key: 'task:T-1', seat: 'impl', expectedTerm: 0 });
    const entry = orch.send({
      key: 'task:T-1',
      from: 'impl',
      to: 'review',
      mailKind: 'review-request',
      body: '{"summary":"look at auth.ts"}',
    });
    expect(entry.kind).toBe('mail');
    expect(entry.mailKind).toBe('review-request');
    expect(orch.snapshot({ key: 'task:T-1' })).toMatchObject({
      term: 1,
      tokens: [{ seat: 'impl', partition: '' }],
    });
    expect(orch.inbox({ key: 'task:T-1', seat: 'review' })).toEqual([
      expect.objectContaining({ mailKind: 'review-request', body: '{"summary":"look at auth.ts"}' }),
    ]);
    expect(orch.channel({ key: 'task:T-1', fromIndex: entry.idx }).entries[0]?.mailKind).toBe(
      'review-request',
    );
  });

  it('rejects oversize bodies and unknown mail routes', () => {
    const orch = connect(':memory:');
    orch.templates.register({
      id: 'routed',
      seats: ['impl', 'review'],
      mail: [{ from: 'impl', to: 'review', kind: 'review-request' }],
    });
    orch.open({ key: 'task:T-1', template: 'routed' });
    expect(() =>
      orch.send({
        key: 'task:T-1',
        from: 'impl',
        to: 'review',
        mailKind: 'note',
        body: 'nope',
      }),
    ).toThrow(OrchestrationValidationError);
    expect(() =>
      orch.send({
        key: 'task:T-1',
        from: 'impl',
        to: 'review',
        mailKind: 'review-request',
        body: 'x'.repeat(65_537),
      }),
    ).toThrow(OrchestrationValidationError);
  });

  it('refuses authorizeSpawn without a token and allows both holders when maxTokens is 2', () => {
    const orch = connect(':memory:');
    classic(orch, { maxTokens: 2 });
    orch.open({ key: 'run:1', template: 'parallel' });
    expect(() => orch.authorizeSpawn({ key: 'run:1', seat: 'impl', expectedTerm: 0 })).toThrow(
      OrchestrationUnauthorizedError,
    );
    orch.grant({ key: 'run:1', seat: 'impl', expectedTerm: 0 });
    orch.grant({ key: 'run:1', seat: 'review', expectedTerm: 1 });
    const impl = orch.authorizeSpawn({ key: 'run:1', seat: 'impl', expectedTerm: 2 });
    const review = orch.authorizeSpawn({ key: 'run:1', seat: 'review', expectedTerm: 2 });
    expect(impl.seat).toBe('impl');
    expect(review.seat).toBe('review');
    expect(impl.idx).not.toBe(review.idx);
  });
});

describe('heartbeat and two connections', () => {
  it('heartbeats without CAS so a concurrent grant still succeeds', () => {
    const file = dbFile();
    const a = connect(file);
    const b = connect(file);
    classic(a);
    classic(b);
    a.open({ key: 'task:T-1', template: 'classic-delivery' });
    a.grant({ key: 'task:T-1', seat: 'impl', expectedTerm: 0 });
    b.heartbeat({ key: 'task:T-1' });
    const renewed = a.grant({ key: 'task:T-1', seat: 'impl', expectedTerm: 1 });
    expect(renewed.term).toBe(2);
    expect(renewed.tokens).toEqual([{ seat: 'impl', partition: '' }]);
    expect(b.snapshot({ key: 'task:T-1' }).tokens).toEqual([{ seat: 'impl', partition: '' }]);
  });

  it('CAS-rejects a stale expectedTerm across two connections', () => {
    const file = dbFile();
    const a = connect(file);
    const b = connect(file);
    classic(a);
    classic(b);
    a.open({ key: 'task:T-1', template: 'classic-delivery' });
    a.grant({ key: 'task:T-1', seat: 'impl', expectedTerm: 0 });
    expect(() => b.grant({ key: 'task:T-1', seat: 'review', expectedTerm: 0 })).toThrow(
      OrchestrationConflictError,
    );
    expect(b.snapshot({ key: 'task:T-1' }).tokens).toEqual([{ seat: 'impl', partition: '' }]);
  });

  it('treats heartbeat after release as a no-op', () => {
    const orch = connect(':memory:');
    classic(orch);
    orch.open({ key: 'task:T-1', template: 'classic-delivery' });
    orch.release({ key: 'task:T-1' });
    expect(() => orch.heartbeat({ key: 'task:T-1' })).not.toThrow();
    expect(orch.snapshot({ key: 'task:T-1' }).status).toBe('released');
  });
});

describe('command logs', () => {
  it('writes one line per command and counts stale takeover / conflict', () => {
    let now = 1_000;
    const file = dbFile();
    const logger = new RecordingLogger();
    const a = connect(file, { now: () => now, staleAfterMs: 100, isProcessAlive: () => false, logger });
    classic(a);
    a.open({ key: 'task:T-1', template: 'classic-delivery' });
    a.grant({ key: 'task:T-1', seat: 'impl', expectedTerm: 0 });
    now = 10_000;
    const takeover = new RecordingLogger();
    const b = connect(file, {
      now: () => now,
      staleAfterMs: 100,
      isProcessAlive: () => false,
      supervisorPid: 22,
      logger: takeover,
    });
    classic(b);
    b.open({ key: 'task:T-1', template: 'classic-delivery' });
    expect(takeover.events.some(event => event.cmd === 'open' && event.ok && event.code === 'stale-takeover')).toBe(
      true,
    );
    expect(takeover.counts.get('orch_stale_takeover_total')).toBe(1);

    const conflict = new RecordingLogger();
    const c = connect(file, {
      now: () => now,
      staleAfterMs: 100,
      isProcessAlive: () => true,
      logger: conflict,
    });
    classic(c);
    expect(() => c.open({ key: 'task:T-1', template: 'classic-delivery' })).toThrow(OrchestrationConflictError);
    expect(conflict.events).toEqual([
      expect.objectContaining({
        cmd: 'open',
        ok: false,
        code: 'orchestration-conflict',
        metric: 'orch_open_conflict_total',
      }),
    ]);
    expect(logger.events.find(event => event.cmd === 'grant')).toMatchObject({
      ok: true,
      seat: 'impl',
      term: 1,
    });
  });
});
