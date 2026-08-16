import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '@rivus/agent-orchestration';
import {
  authorizeSeat,
  harvestImplMailIfNeeded,
  readReviewInbox,
  wrapReviewVerdictIfNeeded,
} from '../../src/orchestration/round';
import { createTaskOrchestration } from '../../src/orchestration/task-orchestration';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function orch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'atl-round-'));
  dirs.push(dir);
  const instance = createTaskOrchestration({
    dbPath: path.join(dir, 'orchestration.db'),
    logger: silentLogger,
  });
  instance.open({ key: 'task:T-1', template: 'classic-delivery' });
  instance.grant({ key: 'task:T-1', seat: 'impl', expectedTerm: 0 });
  return instance;
}

describe('orchestration round helpers', () => {
  it('authorizes the current holder and passes the token to review', () => {
    const instance = orch();
    const permit = authorizeSeat(instance, 'task:T-1', 'impl');
    expect(permit.seat).toBe('impl');
    const passed = authorizeSeat(instance, 'task:T-1', 'review');
    expect(passed.seat).toBe('review');
    expect(instance.snapshot({ key: 'task:T-1' }).tokens).toEqual([{ seat: 'review', partition: '' }]);
  });

  it('harvests impl mail only when the round did not already orch send', () => {
    const instance = orch();
    const before = instance.snapshot({ key: 'task:T-1' }).lastIndex;
    const harvested = harvestImplMailIfNeeded(
      instance,
      'task:T-1',
      '{"mail":[{"to":"review","mailKind":"review-request","body":{"summary":"look"}}]}',
      before,
    );
    expect(harvested).toHaveLength(1);
    expect(harvested[0]?.mailKind).toBe('review-request');

    const again = harvestImplMailIfNeeded(
      instance,
      'task:T-1',
      '{"mail":[{"to":"review","mailKind":"review-request","body":{"summary":"dup"}}]}',
      before,
    );
    expect(again).toEqual([]);
    expect(instance.inbox({ key: 'task:T-1', seat: 'review' })).toHaveLength(1);
  });

  it('wraps a review verdict once and stitches it for the impl seat only via channel', () => {
    const instance = orch();
    authorizeSeat(instance, 'task:T-1', 'review');
    const before = instance.snapshot({ key: 'task:T-1' }).lastIndex;
    const wrapped = wrapReviewVerdictIfNeeded(
      instance,
      'task:T-1',
      { verdict: '驳回', findings: '1. missing test' },
      before,
    );
    expect(wrapped?.mailKind).toBe('review-verdict');
    expect(
      wrapReviewVerdictIfNeeded(instance, 'task:T-1', { verdict: '驳回', findings: 'dup' }, before),
    ).toBeUndefined();
    expect(instance.inbox({ key: 'task:T-1', seat: 'impl' })[0]?.body).toContain('missing test');
  });

  it('builds a review inbox suffix and marks it read only when asked', () => {
    const instance = orch();
    instance.send({
      key: 'task:T-1',
      from: 'impl',
      to: 'review',
      mailKind: 'review-request',
      body: '{"summary":"auth.ts"}',
    });
    const inbox = readReviewInbox(instance, 'task:T-1');
    expect(inbox.suffix).toContain('## orchestration-inbox');
    expect(inbox.suffix).toContain('auth.ts');
    expect(instance.inbox({ key: 'task:T-1', seat: 'review' })).toHaveLength(1);
    inbox.markRead();
    expect(instance.inbox({ key: 'task:T-1', seat: 'review' })).toEqual([]);
  });
});
