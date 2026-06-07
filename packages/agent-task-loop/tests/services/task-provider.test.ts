import { describe, expect, it, vi } from 'vitest';
import { TaskService } from '../../src/services/task-service';
import type { TaskProvider } from '../../src/task-management/task-provider';
import type { TaskRecord } from '../../src/types/task';

describe('TaskService provider boundary', () => {
  it('delegates task reads and writes through a task provider', async () => {
    const task: TaskRecord = {
      taskId: 'TASK-1',
      title: 'Implement JSON output',
      description: 'desc',
      project: 'demo',
      targetAgent: 'codex',
      priority: 1,
      status: '待处理',
    };
    const provider: TaskProvider = {
      listTasks: vi.fn().mockRejectedValue(new Error('listTasks should not be used for targeted reads')),
      listPendingTasks: vi.fn().mockResolvedValue([task]),
      getTaskById: vi.fn().mockResolvedValue(task),
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

    const service = new TaskService(provider);

    await expect(service.listPendingTasks('codex')).resolves.toEqual([
      expect.objectContaining({ taskId: 'TASK-1' }),
    ]);
    await expect(service.getTaskById('TASK-1')).resolves.toEqual(expect.objectContaining({ taskId: 'TASK-1' }));

    await service.updateReviewState(
      { taskId: 'TASK-1' },
      {
        status: '待复核',
        progressSummary: 'ready for review',
      },
    );

    expect(provider.listTasks).not.toHaveBeenCalled();
    expect(provider.listPendingTasks).toHaveBeenCalledWith('codex');
    expect(provider.getTaskById).toHaveBeenCalledWith('TASK-1');
    expect(provider.updateReviewState).toHaveBeenCalledWith(
      { taskId: 'TASK-1' },
      {
        status: '待复核',
        progressSummary: 'ready for review',
      },
    );
  });
});
