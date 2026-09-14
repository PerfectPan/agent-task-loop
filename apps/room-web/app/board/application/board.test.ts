import { describe, expect, it } from 'vitest';
import type { TaskProvider, TaskRecord } from '@rivus/agent-task-loop/task-management';
import { loadBoard } from './board.server';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'task-1',
    source: 'github',
    title: 'Example task',
    description: '',
    project: 'room-web',
    targetAgent: 'claude',
    priority: 1,
    status: '待处理',
    createdAt: '2026-04-18T10:00:00Z',
    updatedAt: '2026-04-18T10:00:00Z',
    ...overrides,
  };
}

function createFakeProvider(tasks: TaskRecord[] | (() => Promise<TaskRecord[]>)): TaskProvider {
  return {
    listTasks: typeof tasks === 'function' ? tasks : async () => tasks,
    listPendingTasks: async () => {
      throw new Error('Not implemented in test fake');
    },
    getTaskById: async () => {
      throw new Error('Not implemented in test fake');
    },
    createTask: async () => {
      throw new Error('Not implemented in test fake');
    },
    claimTask: async () => {
      throw new Error('Not implemented in test fake');
    },
    updateTaskProgress: async () => {
      throw new Error('Not implemented in test fake');
    },
    updateRunnerState: async () => {
      throw new Error('Not implemented in test fake');
    },
    updateTaskAssignment: async () => {
      throw new Error('Not implemented in test fake');
    },
    markTaskSucceeded: async () => {
      throw new Error('Not implemented in test fake');
    },
    markTaskFailed: async () => {
      throw new Error('Not implemented in test fake');
    },
    updateReviewState: async () => {
      throw new Error('Not implemented in test fake');
    },
    updatePublishResult: async () => {
      throw new Error('Not implemented in test fake');
    },
    updateCleanupState: async () => {
      throw new Error('Not implemented in test fake');
    },
  };
}

describe('loadBoard', () => {
  it('tasks from a fake provider land in the right lanes', async () => {
    const tasks: TaskRecord[] = [
      makeTask({ taskId: 't-todo', title: 'Pending task', status: '待处理' }),
      makeTask({ taskId: 't-exec', title: 'Running task 1', status: '执行中' }),
      makeTask({ taskId: 't-running', title: 'Running task 2', status: '进行中' }),
      makeTask({ taskId: 't-review', title: 'Review task', status: '待复核' }),
      makeTask({ taskId: 't-decide', title: 'Blocked task', status: '待决策' }),
      makeTask({ taskId: 't-done', title: 'Completed task', status: '已完成' }),
    ];

    const provider = createFakeProvider(tasks);
    const view = await loadBoard(provider);

    expect(view.error).toBeUndefined();
    expect(view.lanes.map((l) => l.id)).toEqual(['todo', 'running', 'review', 'decide', 'done']);

    const decide = view.lanes.find((l) => l.id === 'decide');
    const running = view.lanes.find((l) => l.id === 'running');
    const review = view.lanes.find((l) => l.id === 'review');
    const todo = view.lanes.find((l) => l.id === 'todo');
    const done = view.lanes.find((l) => l.id === 'done');

    expect(decide?.tasks.map((t) => t.taskId)).toEqual(['t-decide']);
    expect(running?.tasks.map((t) => t.taskId)).toEqual(['t-exec', 't-running']);
    expect(review?.tasks.map((t) => t.taskId)).toEqual(['t-review']);
    expect(todo?.tasks.map((t) => t.taskId)).toEqual(['t-todo']);
    expect(done?.tasks.map((t) => t.taskId)).toEqual(['t-done']);
  });

  it('a provider whose listTasks rejects yields all five empty lanes and an error', async () => {
    const provider = createFakeProvider(async () => {
      throw new Error('Network timeout contacting task backend');
    });

    const view = await loadBoard(provider);

    expect(view.error).toContain('Network timeout contacting task backend');
    expect(view.sources).toEqual([]);
    expect(view.lanes).toHaveLength(5);
    expect(view.lanes.map((l) => l.id)).toEqual(['todo', 'running', 'review', 'decide', 'done']);
    for (const lane of view.lanes) {
      expect(lane.tasks).toEqual([]);
    }
  });

  it('sources is deduplicated and sorted, and ignores records with no source', async () => {
    const tasks: TaskRecord[] = [
      makeTask({ taskId: '1', source: 'github' }),
      makeTask({ taskId: '2', source: 'feishu' }),
      makeTask({ taskId: '3', source: 'github' }),
      makeTask({ taskId: '4', source: undefined }),
      makeTask({ taskId: '5', source: '   ' }),
      makeTask({ taskId: '6', source: 'jira' }),
    ];

    const provider = createFakeProvider(tasks);
    const view = await loadBoard(provider);

    expect(view.sources).toEqual(['feishu', 'github', 'jira']);
  });
});