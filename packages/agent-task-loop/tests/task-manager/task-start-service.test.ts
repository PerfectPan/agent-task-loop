import { describe, expect, it, vi } from 'vitest';
import { OrchestrationConflictError } from '@rivus/agent-orchestration';
import { TaskStartService } from '../../src/task-manager/task-start-service';
import type { TaskRecord } from '../../src/types/task';

function mockOrchestration() {
  return {
    open: vi.fn().mockResolvedValue({ occupied: true }),
    heartbeat: vi.fn(),
    release: vi.fn(),
    fence: <T>(_key: string, operation: () => Promise<T>) => operation(),
  };
}

describe('TaskStartService', () => {
  it('preserves the CLI missing-task error message', async () => {
    const orchestration = mockOrchestration();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(undefined) },
      runner: { run: vi.fn(), resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn() },
      orchestration,
    });

    await expect(service.startTask({ taskId: 'TASK-404', maxRounds: 4 })).rejects.toThrow(
      'Task TASK-404 not found',
    );
    expect(orchestration.open).not.toHaveBeenCalled();
  });

  it('starts an idle Task with the existing review-loop workflow', async () => {
    const existingTask = task({ taskId: 'TASK-20' });
    const run = vi.fn().mockResolvedValue(undefined);
    const orchestration = mockOrchestration();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      orchestration,
    });

    const result = await service.startTask({ taskId: 'TASK-20', maxRounds: 4, targetAgent: 'claude' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      task: existingTask,
      maxRounds: 4,
      signal: expect.any(AbortSignal),
      mutationFence: expect.objectContaining({ run: expect.any(Function) }),
    });
    expect(existingTask).toMatchObject({ targetAgent: 'claude', currentOwner: 'claude' });
    expect(result).toBe(existingTask);
    expect(orchestration.open).toHaveBeenCalledWith({
      key: 'task:TASK-20',
      template: 'classic-delivery',
      context: { goal: 'Task', ref: { taskId: 'TASK-20' } },
    });
    expect(orchestration.release).toHaveBeenCalledWith('task:TASK-20');
  });

  it('refuses to start a Task that already has an active runner', async () => {
    const run = vi.fn();
    const orchestration = mockOrchestration();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-21' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: {
        inspect: vi.fn().mockResolvedValue({ state: 'active', mode: 'execute', round: 2 }),
      },
      orchestration,
    });

    await expect(service.startTask({ taskId: 'TASK-21', maxRounds: 5 })).rejects.toThrow(
      'Task TASK-21 already has an active execute runner',
    );
    expect(run).not.toHaveBeenCalled();
    expect(orchestration.release).toHaveBeenCalledWith('task:TASK-21');
  });

  it('refuses to start when orchestration occupy loses', async () => {
    const existingTask = task({ taskId: 'TASK-25' });
    const run = vi.fn();
    const inspect = vi.fn();
    const orchestration = {
      open: vi.fn().mockRejectedValue(new OrchestrationConflictError('task:TASK-25', 99)),
      heartbeat: vi.fn(),
      release: vi.fn(),
      fence: <T>(_key: string, operation: () => Promise<T>) => operation(),
    };
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect },
      orchestration,
    });

    await expect(
      service.startTask({ taskId: 'TASK-25', maxRounds: 5, targetAgent: 'claude' }),
    ).rejects.toThrow(
      'Task TASK-25 already has an active orchestration (pid 99)',
    );
    expect(existingTask.targetAgent).toBe('codex');
    expect(existingTask.currentOwner).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
    expect(orchestration.release).not.toHaveBeenCalled();
  });

  it('heartbeats occupancy while the review loop is running', async () => {
    const orchestration = mockOrchestration();
    let finish: () => void = () => undefined;
    const run = vi.fn().mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-27' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      orchestration,
      occupancyHeartbeatMs: 10,
    });

    const started = service.startTask({ taskId: 'TASK-27', maxRounds: 4 });
    await vi.waitFor(() => expect(orchestration.heartbeat).toHaveBeenCalledWith('task:TASK-27'));
    finish();
    await started;
    expect(orchestration.release).toHaveBeenCalledWith('task:TASK-27');
  });

  it('aborts the review loop and surfaces a lost occupancy lease', async () => {
    const leaseError = new OrchestrationConflictError('task:TASK-28', 99);
    const orchestration = mockOrchestration();
    orchestration.heartbeat.mockImplementation(() => {
      throw leaseError;
    });
    let runnerSignal: AbortSignal | undefined;
    const run = vi.fn().mockImplementation(
      (input: { signal?: AbortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          runnerSignal = input.signal;
          input.signal?.addEventListener('abort', () => reject(input.signal?.reason), { once: true });
        }),
    );
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-28' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      orchestration,
      occupancyHeartbeatMs: 5,
    });

    await expect(service.startTask({ taskId: 'TASK-28', maxRounds: 4 })).rejects.toBe(leaseError);
    expect(runnerSignal?.aborted).toBe(true);
    expect(orchestration.release).toHaveBeenCalledWith('task:TASK-28');
  });

  it('releases occupancy when the review-loop runner throws', async () => {
    const orchestration = mockOrchestration();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-26' })) },
      runner: { run: vi.fn().mockRejectedValue(new Error('runner exploded')), resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      orchestration,
    });

    await expect(service.startTask({ taskId: 'TASK-26', maxRounds: 4 })).rejects.toThrow(
      'runner exploded',
    );
    expect(orchestration.release).toHaveBeenCalledWith('task:TASK-26');
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
      orchestration: mockOrchestration(),
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
      orchestration: mockOrchestration(),
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
      orchestration: mockOrchestration(),
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
