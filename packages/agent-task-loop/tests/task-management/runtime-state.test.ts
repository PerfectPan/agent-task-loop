import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '../../src/types/task';
import { overlayRuntimeState, pickRuntimeState } from '../../src/task-management/runtime-state';

describe('pickRuntimeState', () => {
  it('keeps only run-time keys, dropping task-definition fields', () => {
    const picked = pickRuntimeState({
      taskId: 'T-1',
      title: 'def',
      status: '执行中',
      targetAgent: 'claude',
      // run-time:
      executionSessionId: 'sess-1',
      runnerPid: 4242,
      workspacePath: '/ws/x',
    });
    expect(picked).toEqual({ executionSessionId: 'sess-1', runnerPid: 4242, workspacePath: '/ws/x' });
  });

  it('records cleared values (empty string / 0 / null), not just truthy ones', () => {
    const picked = pickRuntimeState({ progressSummary: '', runnerPid: 0, runnerKind: '' });
    expect(picked).toHaveProperty('progressSummary', '');
    expect(picked).toHaveProperty('runnerPid', 0);
    expect(picked).toHaveProperty('runnerKind', '');
  });

  it('ignores undefined values', () => {
    const picked = pickRuntimeState({ executionSessionId: undefined, prLink: 'http://x' });
    expect(picked).not.toHaveProperty('executionSessionId');
    expect(picked).toEqual({ prLink: 'http://x' });
  });
});

describe('overlayRuntimeState', () => {
  const base = { taskId: 'T-1', title: 't', description: '', project: 'p', targetAgent: 'claude', priority: 0, status: '待处理' } as TaskRecord;

  it('returns the record unchanged when there is no stored state', () => {
    expect(overlayRuntimeState(base, undefined)).toEqual(base);
  });

  it('fills run-time fields the backend record lacks', () => {
    const out = overlayRuntimeState(base, { executionSessionId: 'sess-9', runnerPid: 7 });
    expect(out.executionSessionId).toBe('sess-9');
    expect(out.runnerPid).toBe(7);
    expect(out.title).toBe('t'); // definition untouched
  });

  it('local wins for present keys, including cleared values (no resurrection)', () => {
    const record = { ...base, progressSummary: 'stale' } as TaskRecord;
    const out = overlayRuntimeState(record, { progressSummary: '' });
    expect(out.progressSummary).toBe(''); // cleared, not "stale"
  });
});
