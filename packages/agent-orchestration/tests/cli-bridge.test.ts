import { describe, expect, it } from 'vitest';
import { createOrchestration, harvestMail, silentLogger, stitchInbox, type ChannelEntry } from '../src/index';
import { runOrchCli } from '../src/infrastructure/cli';
import { closeOrchestration } from '../src/infrastructure/node-factory';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function mail(overrides: Partial<ChannelEntry> = {}): ChannelEntry {
  return {
    key: 'task:T-1',
    idx: 12,
    term: 2,
    kind: 'mail',
    mailKind: 'review-request',
    fromSeat: 'impl',
    toSeat: 'review',
    body: '{"summary":"auth.ts"}',
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('harvestMail / stitchInbox', () => {
  it('reads a whole-text envelope and falls back to the last JSON line', () => {
    expect(harvestMail('{"mail":[{"to":"review","mailKind":"note","body":{"ok":true}}]}')).toEqual([
      { to: 'review', mailKind: 'note', body: { ok: true } },
    ]);
    expect(
      harvestMail('noise\n{"mail":[{"to":"review","mailKind":"note","body":"later"}]}\n'),
    ).toEqual([{ to: 'review', mailKind: 'note', body: 'later' }]);
    expect(harvestMail('not json')).toEqual([]);
  });

  it('stitches only mail entries behind the inbox fence', () => {
    const text = stitchInbox('Do the work.', [mail()]);
    expect(text).toContain('## orchestration-inbox');
    expect(text).toContain('You are seat "review" on run "task:T-1"');
    expect(text).toContain('mailKind=review-request');
    expect(text).toContain('{"summary":"auth.ts"}');
    expect(text).toContain('## end-orchestration-inbox');
    expect(stitchInbox('plain', [])).toBe('plain');
  });
});

describe('orch CLI', () => {
  it('pulls and sends using ORCH_RUN / ORCH_SEAT and rejects impersonation', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'agent-orch-cli-'));
    const dbPath = path.join(dir, 'orchestration.db');
    const orch = createOrchestration({ dbPath, logger: silentLogger });
    orch.templates.register({ id: 'classic-delivery', seats: ['impl', 'review'] });
    orch.open({ key: 'task:T-1', template: 'classic-delivery' });
    closeOrchestration(orch);

    const env = { ORCH_RUN: 'task:T-1', ORCH_SEAT: 'impl', ORCH_DB: dbPath };
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = {
      stdout: { write: (chunk: string) => void stdout.push(chunk) },
      stderr: { write: (chunk: string) => void stderr.push(chunk) },
    };

    expect(runOrchCli(['send', 'review', 'please look', '--kind', 'note'], env, io)).toBe(0);
    expect(stdout.join('')).toContain('please look');

    const reviewOut: string[] = [];
    expect(
      runOrchCli(['pull'], { ...env, ORCH_SEAT: 'review' }, {
        stdout: { write: (chunk: string) => void reviewOut.push(chunk) },
        stderr: io.stderr,
      }),
    ).toBe(0);
    expect(reviewOut.join('')).toContain('please look');

    expect(runOrchCli(['send', 'review', 'x', '--seat', 'review'], env, io)).toBe(1);
    expect(stderr.join('')).toMatch(/does not match ORCH_SEAT/);
    rmSync(dir, { recursive: true, force: true });
  });
});
