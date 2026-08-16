import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Orchestration,
  OrchestrationConflictError,
  OrchestrationSeatError,
  OrchestrationTemplateError,
} from '../src/index';

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'agent-orch-'));
}

function classic(orch: Orchestration): void {
  orch.templates.register({
    id: 'classic-delivery',
    seats: ['impl', 'review'],
    allow: { start: 'impl' },
  });
}

describe('TemplateRegistry', () => {
  it('rejects a duplicate template id', () => {
    const orch = new Orchestration({ baseDir: tempDir() });
    classic(orch);
    expect(() => classic(orch)).toThrow(OrchestrationTemplateError);
  });

  it('rejects a start seat that is not in the roster', () => {
    const orch = new Orchestration({ baseDir: tempDir() });
    expect(() =>
      orch.templates.register({
        id: 'bad',
        seats: ['impl'],
        allow: { start: 'lead' },
      }),
    ).toThrow(/start seat/);
  });
});

describe('Orchestration open / occupy', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  function orch(): Orchestration {
    const dir = tempDir();
    dirs.push(dir);
    const instance = new Orchestration({ baseDir: dir });
    classic(instance);
    return instance;
  }

  it('opens a run and records the registered context', async () => {
    const instance = orch();
    const snapshot = await instance.open({
      key: 'task:T-1',
      template: 'classic-delivery',
      bind: { impl: { cmd: 'grok' }, review: { cmd: 'codex' } },
      context: { goal: 'fix the leak', ref: { taskId: 'T-1' } },
    });

    expect(snapshot.occupied).toBe(true);
    expect(snapshot.allowed).toBe('impl');
    expect(snapshot.seats.impl?.cmd).toBe('grok');
    expect(snapshot.context.goal).toBe('fix the leak');
    expect(snapshot.context.ref).toEqual({ taskId: 'T-1' });
    expect(instance.inspect('task:T-1').key).toBe('task:T-1');
  });

  it('rejects a second open on the same key while the lock is fresh', async () => {
    const dir = tempDir();
    dirs.push(dir);
    const a = new Orchestration({ baseDir: dir });
    const b = new Orchestration({ baseDir: dir });
    classic(a);
    classic(b);
    await a.open({ key: 'task:T-1', template: 'classic-delivery' });

    await expect(b.open({ key: 'task:T-1', template: 'classic-delivery' })).rejects.toMatchObject({
      name: 'OrchestrationConflictError',
      code: 'orchestration-conflict',
      key: 'task:T-1',
      holderPid: process.pid,
    });
    expect(b.inspect('task:T-1').occupied).toBe(true);
  });

  it('lets a later open take over a stale lock', async () => {
    let now = 1_000;
    const dir = tempDir();
    dirs.push(dir);
    const a = new Orchestration({
      baseDir: dir,
      now: () => now,
      staleAfterMs: 100,
      isProcessAlive: () => false,
    });
    classic(a);
    await a.open({ key: 'task:T-1', template: 'classic-delivery' });

    now = 10_000;
    const b = new Orchestration({
      baseDir: dir,
      now: () => now,
      staleAfterMs: 100,
      isProcessAlive: () => false,
    });
    classic(b);
    const snapshot = await b.open({ key: 'task:T-1', template: 'classic-delivery' });
    expect(snapshot.occupied).toBe(true);
  });

  it('allows a new open after release', async () => {
    const instance = orch();
    await instance.open({ key: 'task:T-1', template: 'classic-delivery' });
    instance.release('task:T-1');
    expect(instance.inspect('task:T-1').occupied).toBe(false);

    const again = await instance.open({ key: 'task:T-1', template: 'classic-delivery' });
    expect(again.occupied).toBe(true);
  });

  it('redacts commands from observe', async () => {
    const instance = orch();
    await instance.open({
      key: 'task:T-1',
      template: 'classic-delivery',
      bind: { impl: { cmd: 'grok', env: { TOKEN: 'secret' } } },
    });
    const viewed = instance.observe('task:T-1', 'impl');
    expect(viewed.seats.impl).toEqual({ status: 'idle' });
    expect(JSON.stringify(viewed)).not.toContain('secret');
    expect(JSON.stringify(viewed)).not.toContain('grok');
  });
});

describe('Orchestration allow / facts / mail / spawn', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('refuses spawn unless the seat is allowed', async () => {
    const dir = tempDir();
    dirs.push(dir);
    const instance = new Orchestration({
      baseDir: dir,
      runner: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
    });
    classic(instance);
    await instance.open({
      key: 'task:T-1',
      template: 'classic-delivery',
      bind: { impl: { cmd: 'grok' }, review: { cmd: 'codex' } },
    });

    await expect(instance.spawn('task:T-1', 'review', { cwd: dir })).rejects.toBeInstanceOf(
      OrchestrationSeatError,
    );

    instance.allow('task:T-1', 'review');
    const result = await instance.spawn('task:T-1', 'review', { cwd: dir });
    expect(result.exitCode).toBe(0);
    expect(instance.inspect('task:T-1').seats.review?.status).toBe('exited');
  });

  it('appends facts and mail onto the run context', async () => {
    const dir = tempDir();
    dirs.push(dir);
    const instance = new Orchestration({ baseDir: dir });
    classic(instance);
    await instance.open({ key: 'task:T-1', template: 'classic-delivery' });

    instance.appendFact('task:T-1', 'impl', 'implemented the fix');
    instance.sendMail('task:T-1', { from: 'impl', to: 'review', body: 'please look' });

    const snapshot = instance.inspect('task:T-1');
    expect(snapshot.context.facts).toHaveLength(1);
    expect(snapshot.context.facts[0]?.text).toBe('implemented the fix');
    expect(snapshot.context.mail).toEqual([
      expect.objectContaining({ from: 'impl', to: 'review', body: 'please look' }),
    ]);
  });

  it('lists opened runs', async () => {
    const instance = new Orchestration({ baseDir: tempDir() });
    classic(instance);
    await instance.open({ key: 'task:A', template: 'classic-delivery' });
    await instance.open({ key: 'task:B', template: 'classic-delivery' });
    expect(instance.listRuns().map(run => run.key).sort()).toEqual(['task:A', 'task:B']);
  });
});

describe('OrchestrationConflictError', () => {
  it('is an Error with a stable code', () => {
    const error = new OrchestrationConflictError('task:T-1', 42);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('orchestration-conflict');
  });
});
