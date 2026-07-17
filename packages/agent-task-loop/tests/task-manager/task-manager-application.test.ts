import { describe, expect, it, vi } from 'vitest';
import {
  createTaskManagerApplication,
  TaskManagerInputError,
  TaskManagerOperationError,
} from '../../src/task-manager/task-manager-application';
import type { TaskProvider } from '../../src/task-management/task-provider';
import type { TaskRecord } from '../../src/types/task';

describe('Task Manager application', () => {
  it('returns a bounded public DTO without machine or runner fields', async () => {
    const provider = fakeTaskProvider([
      {
        taskId: 'TASK-101',
        title: 'Ship the Task Manager Plugin',
        description: 'Expose a narrow Rivus capability surface.',
        project: 'agent-task-loop',
        repository: 'example/project',
        source: 'github:example/project',
        targetAgent: 'codex',
        priority: 1,
        status: '执行中',
        progressSummary: 'x'.repeat(2_100),
        resultSummary: 'Public result',
        prLink: 'https://example.com/pull/1',
        currentOwner: 'codex',
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:05:00.000Z',
        workspacePath: '/private/workspace/TASK-101',
        logPath: '/private/log/TASK-101.log',
        reviewLogPath: '/private/log/TASK-101-review.log',
        sessionId: 'session-private',
        sessionName: 'machine-session',
        sessionHistory: 'raw transcript',
        runId: 'run-private',
        runnerPid: 12345,
        runnerKind: 'execute',
        runnerAgent: 'codex',
        runnerRound: 2,
        lastHeartbeatAt: '2026-07-18T00:04:00.000Z',
        claimedBy: 'operator@example.com',
        claimedAt: '2026-07-18T00:01:00.000Z',
        lastError: 'sensitive backend failure',
        publishBranch: 'feat/private-branch',
        publishCommit: '0123456789abcdef',
      },
    ]);
    const application = createTaskManagerApplication({
      taskProvider: provider,
      startTask: vi.fn(),
    });

    const result = await application.listTasks({ limit: 50 });

    expect(result).toEqual({
      count: 1,
      tasks: [
        {
          taskId: 'TASK-101',
          title: 'Ship the Task Manager Plugin',
          description: 'Expose a narrow Rivus capability surface.',
          project: 'agent-task-loop',
          repository: 'example/project',
          source: 'github:example/project',
          targetAgent: 'codex',
          priority: 1,
          status: '执行中',
          progressSummary: `${'x'.repeat(2_000)}…`,
          resultSummary: 'Public result',
          prLink: 'https://example.com/pull/1',
          currentOwner: 'codex',
          createdAt: '2026-07-18T00:00:00.000Z',
          updatedAt: '2026-07-18T00:05:00.000Z',
        },
      ],
      truncated: false,
    });
  });

  it('filters before applying the public list limit', async () => {
    const provider = fakeTaskProvider([
      task({ taskId: 'TASK-0', status: '已完成', targetAgent: 'codex' }),
      task({ taskId: 'TASK-1', status: '待处理', targetAgent: 'claude' }),
      task({ taskId: 'TASK-2', status: '待处理', targetAgent: 'claude' }),
    ]);
    const application = createTaskManagerApplication({ taskProvider: provider, startTask: vi.fn() });

    const result = await application.listTasks({ limit: 1, status: '待处理', targetAgent: 'claude' });

    expect(result.tasks.map(item => item.taskId)).toEqual(['TASK-1']);
    expect(result.count).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('gets one Task through the Task Provider and returns its public DTO', async () => {
    const provider = fakeTaskProvider([]);
    const getTaskById = vi.fn().mockResolvedValue(task({ taskId: 'TASK-7', workspacePath: '/private/task-7' }));
    provider.getTaskById = getTaskById;
    const application = createTaskManagerApplication({ taskProvider: provider, startTask: vi.fn() });

    const result = await application.getTask({ taskId: 'TASK-7' });

    expect(getTaskById).toHaveBeenCalledWith('TASK-7');
    expect(result.task).toEqual(expect.objectContaining({ taskId: 'TASK-7' }));
    expect(result.task).not.toHaveProperty('workspacePath');
  });

  it('reports a missing Task with a stable business error', async () => {
    const application = createTaskManagerApplication({
      taskProvider: fakeTaskProvider([]),
      startTask: vi.fn(),
    });

    await expect(application.getTask({ taskId: 'TASK-404' })).rejects.toEqual(
      expect.objectContaining<TaskManagerInputError>({
        code: 'task-not-found',
        message: 'Task TASK-404 not found',
        name: 'TaskManagerInputError',
      }),
    );
  });

  it('routes create through the Task Provider exactly once', async () => {
    const provider = fakeTaskProvider([]);
    const createTask = vi.fn().mockResolvedValue(undefined);
    provider.createTask = createTask;
    const application = createTaskManagerApplication({ taskProvider: provider, startTask: vi.fn() });
    const input = {
      taskId: 'TASK-8',
      title: 'Create from Rivus',
      project: 'project',
      targetAgent: 'codex' as const,
      priority: 2,
      description: 'Use the application port.',
      source: 'github:example/project',
    };

    await expect(application.createTask(input)).resolves.toEqual({
      action: 'created',
      taskId: 'TASK-8',
    });
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith(input);
  });

  it('routes start through the Task Run application port exactly once', async () => {
    const authoritativeTask = task({
      taskId: 'TASK-9',
      status: '待验收',
      workspacePath: '/private/task-9',
    });
    const startTask = vi.fn().mockResolvedValue(authoritativeTask);
    const provider = fakeTaskProvider([]);
    provider.getTaskById = vi.fn().mockResolvedValue(authoritativeTask);
    const application = createTaskManagerApplication({
      taskProvider: provider,
      startTask,
    });
    const input = { taskId: 'TASK-9', targetAgent: 'claude' as const, maxRounds: 3 };

    const result = await application.startTask(input);

    expect(startTask).toHaveBeenCalledTimes(1);
    expect(startTask).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      action: 'review-loop-completed',
      task: expect.objectContaining({ taskId: 'TASK-9', status: '待验收' }),
      taskId: 'TASK-9',
    });
    expect(result.task).not.toHaveProperty('workspacePath');
  });

  it('refreshes the authoritative Task Backend state after a Task Run completes', async () => {
    const provider = fakeTaskProvider([]);
    provider.getTaskById = vi.fn().mockResolvedValue(task({
      taskId: 'TASK-9',
      status: '待发布',
      progressSummary: 'Review passed and the branch is ready.',
    }));
    const application = createTaskManagerApplication({
      taskProvider: provider,
      startTask: vi.fn().mockResolvedValue(task({ taskId: 'TASK-9', status: '执行中' })),
    });

    const result = await application.startTask({ taskId: 'TASK-9', maxRounds: 3 });

    expect(provider.getTaskById).toHaveBeenCalledWith('TASK-9');
    expect(result.task).toMatchObject({
      taskId: 'TASK-9',
      status: '待发布',
      progressSummary: 'Review passed and the branch is ready.',
    });
  });

  it('fails closed when the Task disappears during the authoritative refresh', async () => {
    const application = createTaskManagerApplication({
      taskProvider: fakeTaskProvider([]),
      startTask: vi.fn().mockResolvedValue(task({ taskId: 'TASK-9', status: '执行中' })),
    });

    await expect(application.startTask({ taskId: 'TASK-9', maxRounds: 3 })).rejects.toMatchObject({
      code: 'task-backend-failed',
      message: 'Unable to refresh task',
    });
  });

  it('maps a raw Provider failure to a neutral backend error', async () => {
    const provider = fakeTaskProvider([]);
    provider.listTasks = vi.fn().mockRejectedValue(new Error('request failed with sensitive provider detail'));
    const application = createTaskManagerApplication({ taskProvider: provider, startTask: vi.fn() });

    await expect(application.listTasks({ limit: 50 })).rejects.toEqual(
      expect.objectContaining<TaskManagerOperationError>({
        code: 'task-backend-failed',
        message: 'Unable to list tasks',
        name: 'TaskManagerOperationError',
      }),
    );
  });

  it('does not expose raw create or Task Run failures', async () => {
    const provider = fakeTaskProvider([]);
    provider.createTask = vi.fn().mockRejectedValue(new Error('raw create detail'));
    const application = createTaskManagerApplication({
      taskProvider: provider,
      startTask: vi.fn().mockRejectedValue(new Error('raw runner detail')),
    });
    const createInput = {
      taskId: 'TASK-10',
      title: 'Task',
      project: 'project',
      targetAgent: 'codex' as const,
      priority: 1,
    };

    await expect(application.createTask(createInput)).rejects.toMatchObject({
      code: 'task-backend-failed',
      message: 'Unable to create task',
    });
    await expect(application.startTask({ taskId: 'TASK-10', maxRounds: 5 })).rejects.toMatchObject({
      code: 'task-run-failed',
      message: 'Unable to start task run',
    });
  });
});

function fakeTaskProvider(tasks: TaskRecord[]): TaskProvider {
  return {
    listTasks: vi.fn().mockResolvedValue(tasks),
    listPendingTasks: vi.fn().mockResolvedValue([]),
    getTaskById: vi.fn(),
    createTask: vi.fn(),
    claimTask: vi.fn(),
    updateTaskProgress: vi.fn(),
    updateRunnerState: vi.fn(),
    updateTaskAssignment: vi.fn(),
    markTaskSucceeded: vi.fn(),
    markTaskFailed: vi.fn(),
    updateReviewState: vi.fn(),
    updatePublishResult: vi.fn(),
    updateCleanupState: vi.fn(),
  };
}

function task(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    taskId: 'TASK-DEFAULT',
    title: 'Task',
    description: 'Description',
    project: 'project',
    targetAgent: 'codex',
    priority: 1,
    status: '待处理',
    ...overrides,
  };
}
