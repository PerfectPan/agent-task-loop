import { describe, expect, it, vi } from 'vitest';
import { CompositeTaskProvider } from '../../src/task-management/composite-task-provider';
import type { SourceProvider } from '../../src/task-management/task-provider';
import type { TaskRecord } from '../../src/types/task';

function record(taskId: string, source: string): TaskRecord {
  return {
    source,
    taskId,
    title: taskId,
    description: '',
    project: 'demo',
    targetAgent: 'codex',
    priority: 3,
    status: '待处理',
  };
}

function fakeProvider(source: string, tasks: TaskRecord[]): SourceProvider {
  return {
    source,
    listTasks: vi.fn().mockResolvedValue(tasks),
    listPendingTasks: vi.fn().mockResolvedValue(tasks),
    getTaskById: vi.fn(async (id: string) => tasks.find(task => task.taskId === id)),
    createTask: vi.fn().mockResolvedValue(undefined),
    claimTask: vi.fn().mockResolvedValue(undefined),
    updateTaskProgress: vi.fn().mockResolvedValue(undefined),
    updateRunnerState: vi.fn().mockResolvedValue(undefined),
    updateTaskAssignment: vi.fn().mockResolvedValue(undefined),
    markTaskSucceeded: vi.fn().mockResolvedValue(undefined),
    markTaskFailed: vi.fn().mockResolvedValue(undefined),
    updateReviewState: vi.fn().mockResolvedValue(undefined),
    updatePublishResult: vi.fn().mockResolvedValue(undefined),
    updateCleanupState: vi.fn().mockResolvedValue(undefined),
  };
}

function failingProvider(source: string, message: string): SourceProvider {
  const provider = fakeProvider(source, []);
  const error = new Error(message);
  provider.listTasks = vi.fn().mockRejectedValue(error);
  provider.listPendingTasks = vi.fn().mockRejectedValue(error);
  provider.getTaskById = vi.fn().mockRejectedValue(error);
  return provider;
}

describe('CompositeTaskProvider', () => {
  it('tolerates a failing source on listTasks — returns healthy sources and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const feishu = failingProvider('feishu', 'missing required scope: base:record:read');
    const github = fakeProvider('github', [record('GH-7', 'github')]);
    const composite = new CompositeTaskProvider([feishu, github]);

    const tasks = await composite.listTasks();
    expect(tasks.map(task => task.taskId)).toEqual(['GH-7']); // not blanked by feishu's failure
    const warned = warn.mock.calls.map(call => String(call[0])).join('\n');
    expect(warned).toContain('feishu');
    expect(warned).toContain('base:record:read');
    warn.mockRestore();
  });

  it('tolerates a failing source on listPendingTasks', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const feishu = failingProvider('feishu', 'boom');
    const github = fakeProvider('github', [record('GH-7', 'github')]);
    const composite = new CompositeTaskProvider([feishu, github]);
    expect((await composite.listPendingTasks('codex')).map(t => t.taskId)).toEqual(['GH-7']);
  });

  it('getTaskById skips a failing source and finds the task in a healthy one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const feishu = failingProvider('feishu', 'boom'); // listed first (default), throws
    const github = fakeProvider('github', [record('GH-7', 'github')]);
    const composite = new CompositeTaskProvider([feishu, github]);
    expect((await composite.getTaskById('GH-7'))?.source).toBe('github');
  });

  it('merges reads from every source', async () => {
    const feishu = fakeProvider('feishu', [record('IDEA-1', 'feishu')]);
    const github = fakeProvider('github', [record('GH-7', 'github')]);
    const composite = new CompositeTaskProvider([feishu, github]);

    const tasks = await composite.listTasks();
    expect(tasks.map(task => task.taskId)).toEqual(['IDEA-1', 'GH-7']);
    expect(composite.sources).toEqual(['feishu', 'github']);
  });

  it('routes writes to the source that owns the task', async () => {
    const feishu = fakeProvider('feishu', []);
    const github = fakeProvider('github', []);
    const composite = new CompositeTaskProvider([feishu, github]);

    await composite.markTaskSucceeded({ taskId: 'GH-7', recordId: '7', source: 'github' }, { resultSummary: 'done' });

    expect(github.markTaskSucceeded).toHaveBeenCalledTimes(1);
    expect(feishu.markTaskSucceeded).not.toHaveBeenCalled();
  });

  it('routes a create by payload source, defaulting to the first provider', async () => {
    const feishu = fakeProvider('feishu', []);
    const github = fakeProvider('github', []);
    const composite = new CompositeTaskProvider([feishu, github]);

    const base = { taskId: 'X', title: 'X', project: 'demo', targetAgent: 'codex' as const, priority: 3 };
    await composite.createTask({ ...base, source: 'github' });
    await composite.createTask(base); // no source ⇒ default (feishu)

    expect(github.createTask).toHaveBeenCalledTimes(1);
    expect(feishu.createTask).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default source for writes with no source', async () => {
    const feishu = fakeProvider('feishu', []);
    const github = fakeProvider('github', []);
    const composite = new CompositeTaskProvider([feishu, github]);

    await composite.claimTask(
      { taskId: 'IDEA-1' },
      { claimedBy: 'me', claimedAt: 'now', runId: 'r1' },
    );

    expect(feishu.claimTask).toHaveBeenCalledTimes(1);
    expect(github.claimTask).not.toHaveBeenCalled();
  });

  it('returns the first match for getTaskById', async () => {
    const feishu = fakeProvider('feishu', [record('IDEA-1', 'feishu')]);
    const github = fakeProvider('github', [record('GH-7', 'github')]);
    const composite = new CompositeTaskProvider([feishu, github]);

    expect((await composite.getTaskById('GH-7'))?.source).toBe('github');
    expect(await composite.getTaskById('missing')).toBeUndefined();
  });

  it('rejects writes to an unknown source', async () => {
    const composite = new CompositeTaskProvider([fakeProvider('feishu', [])]);
    await expect(
      composite.markTaskFailed({ taskId: 'X', source: 'nope' }, { lastError: 'boom' }),
    ).rejects.toThrow(/No task source registered for "nope"/);
  });

  it('rejects duplicate source ids and an empty provider list', () => {
    expect(() => new CompositeTaskProvider([fakeProvider('feishu', []), fakeProvider('feishu', [])])).toThrow(
      /Duplicate task source/,
    );
    expect(() => new CompositeTaskProvider([])).toThrow(/at least one source/);
  });
});
