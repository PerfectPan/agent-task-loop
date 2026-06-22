import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '../../src/types/task';
import type { RuntimeTaskState } from '../../src/task-management/runtime-state';
import type { TaskStateStore } from '../../src/task-management/task-state-store';
import type { TaskProvider } from '../../src/task-management/task-provider';
import { StatefulTaskProvider } from '../../src/task-management/stateful-task-provider';

class MemStore implements TaskStateStore {
  data = new Map<string, RuntimeTaskState>();
  private key(s: string, r: string) {
    return `${s}/${r}`;
  }
  read(s: string, r: string) {
    return this.data.get(this.key(s, r));
  }
  merge(s: string, r: string, p: RuntimeTaskState) {
    this.data.set(this.key(s, r), { ...(this.data.get(this.key(s, r)) ?? {}), ...p });
  }
  clear(s: string, r: string) {
    this.data.delete(this.key(s, r));
  }
}

function record(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    taskId: 'T-1',
    title: 't',
    description: '',
    project: 'p',
    targetAgent: 'claude',
    priority: 0,
    status: '待处理',
    source: 'github:o/r',
    recordId: '7',
    ...overrides,
  };
}

function fakeInner(records: TaskRecord[] = []): TaskProvider {
  return {
    listTasks: vi.fn(async () => records),
    listPendingTasks: vi.fn(async () => records),
    getTaskById: vi.fn(async (id: string) => records.find(r => r.taskId === id)),
    createTask: vi.fn(async () => {}),
    claimTask: vi.fn(async () => {}),
    updateTaskProgress: vi.fn(async () => {}),
    updateRunnerState: vi.fn(async () => {}),
    updateTaskAssignment: vi.fn(async () => {}),
    markTaskSucceeded: vi.fn(async () => {}),
    markTaskFailed: vi.fn(async () => {}),
    updateReviewState: vi.fn(async () => {}),
    updatePublishResult: vi.fn(async () => {}),
    updateCleanupState: vi.fn(async () => {}),
  };
}

const ref = { taskId: 'T-1', recordId: '7', source: 'github:o/r' };

describe('StatefulTaskProvider', () => {
  it('overlays stored run-time state onto listed records', async () => {
    const store = new MemStore();
    store.merge('github:o/r', '7', { executionSessionId: 'sess-9', runnerPid: 3 });
    const sp = new StatefulTaskProvider(fakeInner([record({})]), store);
    const [task] = await sp.listTasks();
    expect(task.executionSessionId).toBe('sess-9');
    expect(task.runnerPid).toBe(3);
  });

  it('getTaskById overlays too', async () => {
    const store = new MemStore();
    store.merge('github:o/r', '7', { prLink: 'http://pr/1' });
    const sp = new StatefulTaskProvider(fakeInner([record({})]), store);
    const task = await sp.getTaskById('T-1');
    expect(task?.prLink).toBe('http://pr/1');
  });

  it('claimTask mirrors the run-time subset AND delegates', async () => {
    const store = new MemStore();
    const inner = fakeInner();
    const sp = new StatefulTaskProvider(inner, store);
    await sp.claimTask(ref, { claimedBy: 'me', claimedAt: 't0', runId: 'r1', executionSessionId: 'sess-1', runnerPid: 5 } as never);
    expect(store.read('github:o/r', '7')).toMatchObject({ claimedBy: 'me', runId: 'r1', executionSessionId: 'sess-1', runnerPid: 5 });
    expect(inner.claimTask).toHaveBeenCalledTimes(1);
  });

  it('updateReviewState mirrors review fields AND the lifecycle status', async () => {
    const store = new MemStore();
    const inner = fakeInner();
    const sp = new StatefulTaskProvider(inner, store);
    await sp.updateReviewState(ref, { status: '待发布', reviewRound: 2, reviewSessionId: 'rev-1' } as never);
    expect(store.read('github:o/r', '7')).toMatchObject({ status: '待发布', reviewRound: 2, reviewSessionId: 'rev-1' });
    expect(inner.updateReviewState).toHaveBeenCalledTimes(1);
  });

  it('injects the implied lifecycle status on claim / succeeded / failed', async () => {
    const store = new MemStore();
    const sp = new StatefulTaskProvider(fakeInner(), store);
    await sp.claimTask(ref, { claimedBy: 'me', claimedAt: 't', runId: 'r' } as never);
    expect(store.read('github:o/r', '7')).toMatchObject({ status: '执行中' });
    await sp.markTaskFailed(ref, { lastError: 'boom' } as never);
    expect(store.read('github:o/r', '7')).toMatchObject({ status: '已失败' });
    await sp.markTaskSucceeded(ref, { resultSummary: 'done' } as never);
    expect(store.read('github:o/r', '7')).toMatchObject({ status: '已完成' });
  });

  it('overlays the stored status onto a github record (待处理 → 待发布)', async () => {
    const store = new MemStore();
    store.merge('github:o/r', '7', { status: '待发布' });
    const sp = new StatefulTaskProvider(fakeInner([record({ status: '待处理' })]), store);
    const [task] = await sp.listTasks();
    expect(task.status).toBe('待发布');
  });

  it('createTask only delegates (nothing mirrored)', async () => {
    const store = new MemStore();
    const inner = fakeInner();
    const sp = new StatefulTaskProvider(inner, store);
    await sp.createTask({ taskId: 'T-2', title: 'x', project: 'p', targetAgent: 'claude', priority: 0, source: 'github:o/r' });
    expect(store.data.size).toBe(0);
    expect(inner.createTask).toHaveBeenCalledTimes(1);
  });

  it('updateCleanupState clears local state and delegates', async () => {
    const store = new MemStore();
    store.merge('github:o/r', '7', { runnerPid: 9, executionSessionId: 'sess-1' });
    const inner = fakeInner();
    const sp = new StatefulTaskProvider(inner, store);
    await sp.updateCleanupState(ref, { progressSummary: 'cleaned' });
    expect(store.read('github:o/r', '7')).toBeUndefined();
    expect(inner.updateCleanupState).toHaveBeenCalledTimes(1);
  });

  it('skips the store when source/recordId are missing but still delegates', async () => {
    const store = new MemStore();
    const inner = fakeInner();
    const sp = new StatefulTaskProvider(inner, store);
    await sp.claimTask({ taskId: 'T-1', source: 'github:o/r' } as never, { claimedBy: 'me', claimedAt: 't', runId: 'r' } as never);
    expect(store.data.size).toBe(0);
    expect(inner.claimTask).toHaveBeenCalledTimes(1);
  });

  it('a throwing store never breaks the delegate (best-effort)', async () => {
    const throwing: TaskStateStore = {
      read: () => { throw new Error('boom'); },
      merge: () => { throw new Error('boom'); },
      clear: () => { throw new Error('boom'); },
    };
    const inner = fakeInner([record({})]);
    const sp = new StatefulTaskProvider(inner, throwing);
    await expect(sp.claimTask(ref, { claimedBy: 'm', claimedAt: 't', runId: 'r' } as never)).resolves.toBeUndefined();
    expect(inner.claimTask).toHaveBeenCalledTimes(1);
    // read overlay also survives a throwing store
    await expect(sp.listTasks()).resolves.toHaveLength(1);
  });
});
