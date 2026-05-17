import { describe, expect, it, vi } from 'vitest';
import { TaskService } from '../../src/services/task-service';
import type { TaskProvider } from '../../src/task-management/task-provider';

describe('TaskService provider boundary', () => {
  it('delegates task reads and writes through a task provider', async () => {
    const provider = {
      listTasks: vi.fn().mockResolvedValue([
        {
          taskId: 'TASK-1',
          title: 'Implement JSON output',
          description: 'desc',
          project: 'demo',
          targetAgent: 'codex',
          priority: 1,
          status: '待处理',
        },
      ]),
      updateReviewState: vi.fn().mockResolvedValue(undefined),
    } as unknown as TaskProvider;

    const service = new TaskService(provider);

    await expect(service.listPendingTasks('codex')).resolves.toEqual([
      expect.objectContaining({ taskId: 'TASK-1' }),
    ]);

    await service.updateReviewState(
      { taskId: 'TASK-1' },
      {
        status: '待复核',
        progressSummary: 'ready for review',
      },
    );

    expect(provider.listTasks).toHaveBeenCalledTimes(1);
    expect(provider.updateReviewState).toHaveBeenCalledWith(
      { taskId: 'TASK-1' },
      {
        status: '待复核',
        progressSummary: 'ready for review',
      },
    );
  });
});
