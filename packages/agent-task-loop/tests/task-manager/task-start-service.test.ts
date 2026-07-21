import { describe, expect, it, vi } from 'vitest';
import { TaskStartService } from '../../src/task-manager/task-start-service';
import type { TaskRecord } from '../../src/types/task';

describe('TaskStartService', () => {
  it('preserves the CLI missing-task error message', async () => {
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(undefined) },
      runner: { run: vi.fn(), resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn() },
    });

    await expect(service.startTask({ taskId: 'TASK-404', maxRounds: 4 })).rejects.toThrow(
      'Task TASK-404 not found',
    );
  });

  it('starts an idle Task with the existing review-loop workflow', async () => {
    const existingTask = task({ taskId: 'TASK-20' });
    const run = vi.fn().mockResolvedValue(undefined);
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
    });

    const result = await service.startTask({ taskId: 'TASK-20', maxRounds: 4, targetAgent: 'claude' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ task: existingTask, maxRounds: 4 });
    expect(existingTask).toMatchObject({ targetAgent: 'claude', currentOwner: 'claude' });
    expect(result).toBe(existingTask);
  });

  it('refuses to start a Task that already has an active runner', async () => {
    const run = vi.fn();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-21' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: {
        inspect: vi.fn().mockResolvedValue({ state: 'active', mode: 'execute', round: 2 }),
      },
    });

    await expect(service.startTask({ taskId: 'TASK-21', maxRounds: 5 })).rejects.toThrow(
      'Task TASK-21 already has an active runner',
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('resumes a stale review round with the remaining round budget', async () => {
    const existingTask = task({
      taskId: 'TASK-22',
      status: '待复核',
      workspacePath: '/workspace/task-22',
      resultSummary: 'Implementation ready',
    });
    const inspection = { state: 'stale' as const, mode: 'review' as const, round: 3, reason: 'stale runner' };
    const resumeReview = vi.fn().mockResolvedValue(undefined);
    const onRecovery = vi.fn();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run: vi.fn(), resumeReview },
      livenessService: { inspect: vi.fn().mockResolvedValue(inspection) },
      onRecovery,
    });

    await service.startTask({ taskId: 'TASK-22', maxRounds: 4 });

    expect(onRecovery).toHaveBeenCalledWith(inspection);
    expect(resumeReview).toHaveBeenCalledWith({
      task: existingTask,
      maxRounds: 6,
      round: 3,
      workspacePath: '/workspace/task-22',
      resultSummary: 'Implementation ready',
    });
  });

  it('recovers a stale execution round with its recovery prompt', async () => {
    const existingTask = task({ taskId: 'TASK-23', status: '执行中' });
    const run = vi.fn().mockResolvedValue(undefined);
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: {
        inspect: vi.fn().mockResolvedValue({
          state: 'stale',
          mode: 'execute',
          round: 2,
          promptOverride: 'Recover from the last durable state.',
        }),
      },
    });

    await service.startTask({ taskId: 'TASK-23', maxRounds: 4 });

    expect(run).toHaveBeenCalledWith({
      task: existingTask,
      maxRounds: 5,
      promptOverride: 'Recover from the last durable state.',
      startRound: 2,
    });
  });

  it('restarts a failed Task as the next rework round', async () => {
    const existingTask = task({
      taskId: 'TASK-24',
      status: '已失败',
      reviewRound: 2,
      description: 'Fix the integration',
      resultSummary: 'Previous attempt',
      acceptanceFeedback: 'Keep the public DTO narrow',
    });
    const run = vi.fn().mockResolvedValue(undefined);
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
    });

    await service.startTask({ taskId: 'TASK-24', maxRounds: 4 });

    expect(run).toHaveBeenCalledWith({
      task: existingTask,
      maxRounds: 6,
      startRound: 3,
      promptOverride: expect.stringContaining('Keep the public DTO narrow'),
    });
  });
});

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
