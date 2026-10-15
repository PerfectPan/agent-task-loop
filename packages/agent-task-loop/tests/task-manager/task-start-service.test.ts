import { describe, expect, it, vi } from 'vite-plus/test';
import { TaskLeaseLostError } from '../../src/orchestration/lease';
import { TaskStartService } from '../../src/task-manager/task-start-service';
import type { TaskOccupancy } from '../../src/task-manager/task-occupancy-service';
import type { TaskRecord } from '../../src/types/task';

/** Stands in for the real lease-backed occupancy: runs the workflow, keeps the context it was given. */
function mockOccupancy() {
  const occupancy: {
    run: ReturnType<typeof vi.fn>;
    lastContext?: { signal: AbortSignal; mutationFence: { run: (m: () => Promise<unknown>) => Promise<unknown> } };
  } = {
    run: vi.fn(async (_input: { taskId: string }, workflow: (context: never) => Promise<unknown>) => {
      const context = {
        signal: new AbortController().signal,
        mutationFence: { run: (mutation: () => Promise<unknown>) => mutation() },
      };
      occupancy.lastContext = context;
      return workflow(context as never);
    }),
  };
  return occupancy;
}

function occupancyOf(occupancy: unknown): TaskOccupancy {
  return occupancy as TaskOccupancy;
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

describe('TaskStartService', () => {
  it('preserves the CLI missing-task error message', async () => {
    const occupancy = mockOccupancy();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(undefined) },
      runner: { run: vi.fn(), resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn() },
      occupancy: occupancyOf(occupancy),
    });

    await expect(service.startTask({ taskId: 'TASK-404', maxRounds: 4 })).rejects.toThrow('Task TASK-404 not found');
    expect(occupancy.run).not.toHaveBeenCalled();
  });

  it('starts an idle Task with the existing review-loop workflow', async () => {
    const existingTask = task({ taskId: 'TASK-20' });
    const run = vi.fn().mockResolvedValue(undefined);
    const occupancy = mockOccupancy();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      occupancy: occupancyOf(occupancy),
    });

    const result = await service.startTask({
      taskId: 'TASK-20',
      maxRounds: 4,
      targetAgent: 'claude',
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      task: existingTask,
      maxRounds: 4,
      signal: expect.any(AbortSignal),
      mutationFence: expect.objectContaining({ run: expect.any(Function) }),
    });
    expect(existingTask).toMatchObject({ targetAgent: 'claude', currentOwner: 'claude' });
    expect(result).toBe(existingTask);
    expect(occupancy.run).toHaveBeenCalledWith({ taskId: 'TASK-20', goal: 'Task' }, expect.any(Function));
  });

  it('refuses to start a Task that already has an active runner', async () => {
    const run = vi.fn();
    const occupancy = mockOccupancy();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-21' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: {
        inspect: vi.fn().mockResolvedValue({ state: 'active', mode: 'execute', round: 2 }),
      },
      occupancy: occupancyOf(occupancy),
    });

    await expect(service.startTask({ taskId: 'TASK-21', maxRounds: 5 })).rejects.toThrow(
      'Task TASK-21 already has an active execute runner',
    );
    expect(run).not.toHaveBeenCalled();
    expect(occupancy.run).toHaveBeenCalledTimes(1);
  });

  it('refuses to start when occupancy is already held elsewhere', async () => {
    const existingTask = task({ taskId: 'TASK-25' });
    const run = vi.fn();
    const inspect = vi.fn();
    const occupancy = {
      run: vi.fn().mockRejectedValue(new Error('Task TASK-25 already has an active orchestration (pid 99)')),
    };
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect },
      occupancy: occupancyOf(occupancy as never),
    });

    await expect(service.startTask({ taskId: 'TASK-25', maxRounds: 5, targetAgent: 'claude' })).rejects.toThrow(
      'Task TASK-25 already has an active orchestration (pid 99)',
    );
    expect(existingTask.targetAgent).toBe('codex');
    expect(existingTask.currentOwner).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('holds occupancy until the review loop finishes', async () => {
    const occupancy = mockOccupancy();
    let finish: () => void = () => undefined;
    const run = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-27' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      occupancy: occupancyOf(occupancy),
    });

    const started = service.startTask({ taskId: 'TASK-27', maxRounds: 4 });
    await vi.waitFor(() =>
      expect(occupancy.run).toHaveBeenCalledWith({ taskId: 'TASK-27', goal: 'Task' }, expect.any(Function)),
    );
    finish();
    await started;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('aborts the review loop and surfaces a lost occupancy lease', async () => {
    const leaseError = new TaskLeaseLostError({
      _tag: 'LeaseLost',
      key: 'task:TASK-28',
      generation: 1,
      reason: 'taken-over',
    });
    const occupancy = mockOccupancy();
    occupancy.run.mockImplementation(
      async (_input: { taskId: string }, workflow: (context: { signal: AbortSignal }) => Promise<unknown>) => {
        const controller = new AbortController();
        const started = workflow({ signal: controller.signal } as never);
        await Promise.resolve();
        controller.abort(leaseError);
        await started.catch(() => undefined);
        throw leaseError;
      },
    );
    let runnerSignal: AbortSignal | undefined;
    const run = vi.fn().mockImplementation(
      (input: { signal?: AbortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          runnerSignal = input.signal;
          input.signal?.addEventListener('abort', () => reject(input.signal?.reason), {
            once: true,
          });
        }),
    );
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-28' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      occupancy: occupancyOf(occupancy),
    });

    await expect(service.startTask({ taskId: 'TASK-28', maxRounds: 4 })).rejects.toBe(leaseError);
    expect(runnerSignal?.aborted).toBe(true);
  });

  it('releases occupancy when the review-loop runner throws', async () => {
    const occupancy = mockOccupancy();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-26' })) },
      runner: {
        run: vi.fn().mockRejectedValue(new Error('runner exploded')),
        resumeReview: vi.fn(),
      },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      occupancy: occupancyOf(occupancy),
    });

    await expect(service.startTask({ taskId: 'TASK-26', maxRounds: 4 })).rejects.toThrow('runner exploded');
    expect(occupancy.run).toHaveBeenCalledTimes(1);
  });

  it('resumes a stale review round with the remaining round budget', async () => {
    const existingTask = task({
      taskId: 'TASK-22',
      status: '待复核',
      workspacePath: '/workspace/task-22',
      resultSummary: 'Implementation ready',
    });
    const inspection = {
      state: 'stale' as const,
      mode: 'review' as const,
      round: 3,
      reason: 'stale runner',
    };
    const resumeReview = vi.fn().mockResolvedValue(undefined);
    const onRecovery = vi.fn();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run: vi.fn(), resumeReview },
      livenessService: { inspect: vi.fn().mockResolvedValue(inspection) },
      occupancy: occupancyOf(mockOccupancy()),
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
      signal: expect.any(AbortSignal),
      mutationFence: expect.objectContaining({ run: expect.any(Function) }),
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
      occupancy: occupancyOf(mockOccupancy()),
    });

    await service.startTask({ taskId: 'TASK-23', maxRounds: 4 });

    expect(run).toHaveBeenCalledWith({
      task: existingTask,
      maxRounds: 5,
      promptOverride: 'Recover from the last durable state.',
      startRound: 2,
      signal: expect.any(AbortSignal),
      mutationFence: expect.objectContaining({ run: expect.any(Function) }),
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
      occupancy: occupancyOf(mockOccupancy()),
    });

    await service.startTask({ taskId: 'TASK-24', maxRounds: 4 });

    expect(run).toHaveBeenCalledWith({
      task: existingTask,
      maxRounds: 6,
      startRound: 3,
      promptOverride: expect.stringContaining('Keep the public DTO narrow'),
      signal: expect.any(AbortSignal),
      mutationFence: expect.objectContaining({ run: expect.any(Function) }),
    });
  });
});
