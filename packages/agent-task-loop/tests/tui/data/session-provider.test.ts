import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '../../../src/types/task';
import {
  buildPreviewFromTask,
  createFakeSessionProvider,
} from '../../../src/tui/data/session-provider';
import { formatSessionHistoryEntry } from '../../../src/services/session-history';
import { fixedNow, isoSecondsAgo } from '../helpers';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'T-1',
    title: 'Demo task',
    description: 'do the thing',
    project: 'proj',
    targetAgent: 'claude',
    priority: 1,
    status: '执行中',
    ...overrides,
  };
}

describe('buildPreviewFromTask', () => {
  it('derives history, heartbeat, runner, sessions and live from a TaskRecord', () => {
    const historyText = [
      formatSessionHistoryEntry({
        kind: 'execute',
        round: 1,
        agent: 'claude',
        sessionName: 'sess-a',
        sessionId: 'id-a',
      }),
      formatSessionHistoryEntry({
        kind: 'review',
        round: 2,
        agent: 'codex',
        sessionName: 'sess-b',
      }),
    ].join('\n');

    const task = makeTask({
      taskId: 'T-42',
      status: '执行中',
      sessionHistory: historyText,
      lastHeartbeatAt: isoSecondsAgo(5),
      runnerKind: 'execute',
      runnerAgent: 'codex',
      runnerRound: 3,
      runnerPid: 4242,
      executionSessionId: 'exec-id',
      executionSessionName: 'exec-name',
    });

    const preview = buildPreviewFromTask(task, fixedNow());

    expect(preview.taskId).toBe('T-42');
    expect(preview.history).toHaveLength(2);
    expect(preview.history[0]?.kind).toBe('execute');
    expect(preview.history[1]?.agent).toBe('codex');

    expect(preview.heartbeat.state).toBe('fresh');
    expect(preview.heartbeat.ageMs).toBe(5000);

    expect(preview.runner).toEqual({
      kind: 'execute',
      agent: 'codex',
      round: 3,
      pid: 4242,
    });

    expect(preview.sessionId).toBe('exec-id');
    expect(preview.sessionName).toBe('exec-name');
    expect(preview.live).toBe(true);

    expect(preview.logTail).toEqual([]);
    expect(preview.hasLog).toBe(false);
  });

  it('falls back to targetAgent and base session fields, and is not live for done', () => {
    const task = makeTask({
      status: '已完成',
      targetAgent: 'glm',
      sessionId: 'base-id',
      sessionName: 'base-name',
    });

    const preview = buildPreviewFromTask(task, fixedNow());

    expect(preview.runner.agent).toBe('glm');
    expect(preview.runner.kind).toBeUndefined();
    expect(preview.sessionId).toBe('base-id');
    expect(preview.sessionName).toBe('base-name');
    expect(preview.live).toBe(false);
    expect(preview.heartbeat.state).toBe('none');
  });

  it('returns an empty history for a task with no sessionHistory', () => {
    const preview = buildPreviewFromTask(makeTask(), fixedNow());
    expect(preview.history).toEqual([]);
  });

  it('uses provided logTail and sets hasLog accordingly', () => {
    const preview = buildPreviewFromTask(makeTask(), fixedNow(), ['line 1', 'line 2']);
    expect(preview.logTail).toEqual(['line 1', 'line 2']);
    expect(preview.hasLog).toBe(true);
  });
});

describe('createFakeSessionProvider', () => {
  it('returns a preview built from the task', async () => {
    const provider = createFakeSessionProvider();
    const preview = await provider.getPreview(makeTask({ taskId: 'T-9' }), fixedNow());
    expect(preview.taskId).toBe('T-9');
    expect(preview.history).toEqual([]);
  });

  it('applies overrides keyed by taskId', async () => {
    const provider = createFakeSessionProvider({
      'T-9': { logTail: ['x'], hasLog: true, live: true },
    });
    const preview = await provider.getPreview(makeTask({ taskId: 'T-9' }), fixedNow());
    expect(preview.logTail).toEqual(['x']);
    expect(preview.hasLog).toBe(true);
    expect(preview.live).toBe(true);
  });

  it('leaves non-matching tasks untouched', async () => {
    const provider = createFakeSessionProvider({
      'T-other': { hasLog: true },
    });
    const preview = await provider.getPreview(makeTask({ taskId: 'T-9' }), fixedNow());
    expect(preview.hasLog).toBe(false);
  });
});
