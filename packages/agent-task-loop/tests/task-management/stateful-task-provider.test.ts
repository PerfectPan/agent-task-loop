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

  it('injects the implied lifecycle status on claim / succeeded / failed (matching Feishu)', async () => {
    const store = new MemStore();
    const sp = new StatefulTaskProvider(fakeInner(), store);
    await sp.claimTask(ref, { claimedBy: 'me', claimedAt: 't', runId: 'r' } as never);
    expect(store.read('github:o/r', '7')).toMatchObject({ status: '执行中' });
    await sp.markTaskFailed(ref, { lastError: 'boom' } as never);
    expect(store.read('github:o/r', '7')).toMatchObject({ status: '已失败' });
    // markTaskSucceeded means "awaiting acceptance" — Feishu writes 待验收, NOT 已完成.
    await sp.markTaskSucceeded(ref, { resultSummary: 'done' } as never);
    expect(store.read('github:o/r', '7')).toMatchObject({ status: '待验收' });
  });

  it('updateCleanupState keeps status / prLink / session history and never resurrects to 待处理', async () => {
    const store = new MemStore();
    store.merge('github:o/r', '7', {
      status: '已完成',
      prLink: 'https://github.com/o/r/pull/74',
      sessionHistory: 'round=1 execute',
      executionSessionId: 'sess-1',
      publishBranch: 'task/x',
      workspacePath: '/ws/x',
      runnerPid: 9,
    });
    const inner = fakeInner();
    const sp = new StatefulTaskProvider(inner, store);
    await sp.updateCleanupState(ref, { progressSummary: 'cleaned' });
    const state = store.read('github:o/r', '7')!;
    // Durable outcome survives cleanup — no resurrection, PR + transcript stay visible.
    expect(state.status).toBe('已完成');
    expect(state.prLink).toBe('https://github.com/o/r/pull/74');
    expect(state.sessionHistory).toBe('round=1 execute');
    expect(state.executionSessionId).toBe('sess-1');
    expect(state.publishBranch).toBe('task/x');
    // Transient run-time fields are cleared.
    expect(state.workspacePath).toBe('');
    expect(state.runnerPid).toBeNull();
    expect(inner.updateCleanupState).toHaveBeenCalledTimes(1);
  });

  it('overlays the stored status onto a github record (待处理 → 待发布)', async () => {
    const store = new MemStore();
    store.merge('github:o/r', '7', { status: '待发布' });
    const sp = new StatefulTaskProvider(fakeInner([record({ status: '待处理' })]), store);
    const [task] = await sp.listTasks();
    expect(task.status).toBe('待发布');
  });

  it('listPendingTasks excludes a task the store knows is in-flight (overlaid status wins)', async () => {
    const store = new MemStore();
    // Backend reports 待处理 (open GitHub issue), but the store knows it's executing.
    store.merge('github:o/r', '7', { status: '执行中' });
    const sp = new StatefulTaskProvider(fakeInner([record({ targetAgent: 'codex', status: '待处理' })]), store);
    expect(await sp.listPendingTasks('codex')).toHaveLength(0);
  });

  it('listPendingTasks includes a genuinely pending task for the agent', async () => {
    const store = new MemStore();
    const sp = new StatefulTaskProvider(
      fakeInner([record({ taskId: 'T-9', recordId: '9', targetAgent: 'codex', status: '待处理' })]),
      store,
    );
    const pending = await sp.listPendingTasks('codex');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.taskId).toBe('T-9');
  });

  it('createTask only delegates (nothing mirrored)', async () => {
    const store = new MemStore();
    const inner = fakeInner();
    const sp = new StatefulTaskProvider(inner, store);
    await sp.createTask({ taskId: 'T-2', title: 'x', project: 'p', targetAgent: 'claude', priority: 0, source: 'github:o/r' });
    expect(store.data.size).toBe(0);
    expect(inner.createTask).toHaveBeenCalledTimes(1);
  });

  it('updateCleanupState clears transient run-time state but keeps session ids and delegates', async () => {
    const store = new MemStore();
    store.merge('github:o/r', '7', { runnerPid: 9, executionSessionId: 'sess-1', workspacePath: '/ws/x' });
    const inner = fakeInner();
    const sp = new StatefulTaskProvider(inner, store);
    await sp.updateCleanupState(ref, { progressSummary: 'cleaned' });
    const state = store.read('github:o/r', '7')!;
    expect(state.executionSessionId).toBe('sess-1'); // session id kept → transcript stays findable
    expect(state.workspacePath).toBe('');            // transient wiped
    expect(state.runnerPid).toBeNull();
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
