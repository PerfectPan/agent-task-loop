import { describe, expect, it, vi } from 'vitest';
import type { TaskProvider, TaskRecord } from '@rivus/agent-task-loop/task-management';
import { loadTaskDetail } from './task-detail.server';

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

function createFakeProvider(
  getTaskById: (id: string) => Promise<TaskRecord | undefined>,
): TaskProvider {
  return {
    listTasks: async () => {
      throw new Error('Not implemented in test fake');
    },
    listPendingTasks: async () => {
      throw new Error('Not implemented in test fake');
    },
    getTaskById,
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

describe('loadTaskDetail', () => {
  it('a known id returns the task and no error', async () => {
    const task = makeTask({ taskId: 'IDEA-123', title: 'Example known task' });
    const provider = createFakeProvider(async (id) => (id === 'IDEA-123' ? task : undefined));

    const result = await loadTaskDetail('IDEA-123', provider);

    expect(result.error).toBeUndefined();
    expect(result.task).toEqual(task);
  });

  it('an unknown id returns an error naming the id, and no task', async () => {
    const provider = createFakeProvider(async () => undefined);

    const result = await loadTaskDetail('IDEA-404', provider);

    expect(result.task).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain('IDEA-404');
  });

  it('a provider that rejects returns an error rather than throwing', async () => {
    const provider = createFakeProvider(async () => {
      throw new Error('Backend database connection timeout');
    });

    const result = await loadTaskDetail('IDEA-500', provider);

    expect(result.task).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Backend database connection timeout');
  });

  it('a blank id returns an error without calling the provider (assert the fake was not called)', async () => {
    const getTaskById = vi.fn(async () => undefined);
    const provider = createFakeProvider(getTaskById);

    const resultEmpty = await loadTaskDetail('', provider);
    expect(resultEmpty.task).toBeUndefined();
    expect(resultEmpty.error).toBeDefined();
    expect(getTaskById).not.toHaveBeenCalled();

    const resultSpaces = await loadTaskDetail('   \t  ', provider);
    expect(resultSpaces.task).toBeUndefined();
    expect(resultSpaces.error).toBeDefined();
    expect(getTaskById).not.toHaveBeenCalled();
  });
});
