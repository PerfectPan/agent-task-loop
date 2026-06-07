import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '../../../src/types/task';
import type { SessionPreview } from '../../../src/tui/types';
import { fixedNow } from '../helpers';

// Stub the sibling provider module (owned by a teammate). Only the bits
// FsSessionProvider relies on are modelled: buildPreviewFromTask must reflect
// the passed logTail and derive hasLog from it. This keeps the test focused on
// FsSessionProvider's own logic (path selection, tailing, error handling).
vi.mock('../../../src/tui/data/session-provider', () => ({
  buildPreviewFromTask: (
    task: TaskRecord,
    _now: number,
    logTail: string[] = [],
  ): SessionPreview => ({
    taskId: task.taskId,
    runner: {},
    heartbeat: { state: 'none', ageMs: null },
    history: [],
    logTail,
    hasLog: logTail.length > 0,
    live: false,
  }),
}));

import { FsSessionProvider } from '../../../src/tui/data/fs-session-provider';

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

describe('FsSessionProvider', () => {
  it('tails the last N lines of the log and sets hasLog true', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const readFile = vi.fn(async () => `${lines.join('\n')}\n`);
    const provider = new FsSessionProvider({ maxLines: 3, readFile });

    const preview = await provider.getPreview(makeTask({ logPath: '/log/exec.log' }), fixedNow());

    expect(readFile).toHaveBeenCalledWith('/log/exec.log');
    expect(preview.logTail).toEqual(['line 8', 'line 9', 'line 10']);
    expect(preview.hasLog).toBe(true);
  });

  it('returns hasLog false without reading when no log path exists', async () => {
    const readFile = vi.fn(async () => 'unused');
    const provider = new FsSessionProvider({ readFile });

    const preview = await provider.getPreview(makeTask(), fixedNow());

    expect(readFile).not.toHaveBeenCalled();
    expect(preview.logTail).toEqual([]);
    expect(preview.hasLog).toBe(false);
  });

  it('degrades gracefully to an empty tail when readFile rejects', async () => {
    const readFile = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    const provider = new FsSessionProvider({ readFile });

    const preview = await provider.getPreview(makeTask({ logPath: '/missing.log' }), fixedNow());

    expect(readFile).toHaveBeenCalledWith('/missing.log');
    expect(preview.logTail).toEqual([]);
    expect(preview.hasLog).toBe(false);
  });

  it('reads reviewLogPath for a review runner', async () => {
    const readFile = vi.fn(async () => 'review line a\nreview line b\n');
    const provider = new FsSessionProvider({ readFile });

    const task = makeTask({
      runnerKind: 'review',
      logPath: '/log/exec.log',
      reviewLogPath: '/log/review.log',
    });
    const preview = await provider.getPreview(task, fixedNow());

    expect(readFile).toHaveBeenCalledWith('/log/review.log');
    expect(readFile).not.toHaveBeenCalledWith('/log/exec.log');
    expect(preview.logTail).toEqual(['review line a', 'review line b']);
    expect(preview.hasLog).toBe(true);
  });

  it('uses logPath for an execute runner', async () => {
    const readFile = vi.fn(async () => 'exec only\n');
    const provider = new FsSessionProvider({ readFile });

    const task = makeTask({
      runnerKind: 'execute',
      logPath: '/log/exec.log',
      reviewLogPath: '/log/review.log',
    });
    const preview = await provider.getPreview(task, fixedNow());

    expect(readFile).toHaveBeenCalledWith('/log/exec.log');
    expect(preview.logTail).toEqual(['exec only']);
  });
});
