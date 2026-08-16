import { describe, expect, it, vi } from 'vitest';
import { OrchestrationConflictError } from '@rivus/agent-orchestration';
import { TaskStartService } from '../../src/task-manager/task-start-service';
import type { TaskRecord } from '../../src/types/task';

function mockOrchestration() {
  return {
    open: vi.fn().mockReturnValue({ term: 0 }),
    heartbeat: vi.fn(),
    snapshot: vi.fn().mockReturnValue({ term: 0, lastIndex: 0, tokens: [] }),
    grant: vi.fn().mockReturnValue({ term: 1 }),
    pass: vi.fn().mockReturnValue({ term: 2 }),
    send: vi.fn(),
    authorizeSpawn: vi.fn().mockReturnValue({ seat: 'impl', term: 1, idx: 1 }),
    inbox: vi.fn().mockReturnValue([]),
    channel: vi.fn().mockReturnValue({ entries: [] }),
    release: vi.fn(),
  };
}

function fakeTimers() {
  const handles = new Map<number, () => void>();
  let next = 1;
  return {
    setInterval: (fn: () => void) => {
      const id = next++;
      handles.set(id, fn);
      return id as unknown as NodeJS.Timeout;
    },
    clearInterval: (id: NodeJS.Timeout) => {
      handles.delete(Number(id));
    },
    tick() {
      for (const fn of handles.values()) {
        fn();
      }
    },
    get size() {
      return handles.size;
    },
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

  it('starts an idle Task, grants impl, and releases', async () => {
    const existingTask = task({ taskId: 'TASK-20' });
    const run = vi.fn().mockResolvedValue(undefined);
    const orchestration = mockOrchestration();
    const logs: string[] = [];
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      orchestration,
      log: message => logs.push(message),
    });

    const result = await service.startTask({ taskId: 'TASK-20', maxRounds: 4, targetAgent: 'claude' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ task: existingTask, maxRounds: 4 });
    expect(existingTask).toMatchObject({ targetAgent: 'claude', currentOwner: 'claude' });
    expect(result).toBe(existingTask);
    expect(orchestration.open).toHaveBeenCalledWith({
      key: 'task:TASK-20',
      template: 'classic-delivery',
      bind: { impl: { cmd: 'claude' }, review: { cmd: 'codex' } },
      goal: 'Task',
      ref: { taskId: 'TASK-20' },
    });
    expect(orchestration.grant).toHaveBeenCalledWith({
      key: 'task:TASK-20',
      seat: 'impl',
      expectedTerm: 0,
    });
    expect(orchestration.release).toHaveBeenCalledWith({ key: 'task:TASK-20' });
    expect(logs.join('\n')).toContain('orch grant seat=impl');
    expect(logs.join('\n')).toContain('orch release key=task:TASK-20');
  });

  it('refuses to start a Task that already has an active runner and does not grant', async () => {
    const run = vi.fn();
    const orchestration = mockOrchestration();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-21' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: {
        inspect: vi.fn().mockResolvedValue({ state: 'active', mode: 'execute', round: 2 }),
      },
      orchestration,
      log: () => undefined,
    });

    await expect(service.startTask({ taskId: 'TASK-21', maxRounds: 5 })).rejects.toThrow(
      'Task TASK-21 already has an active execute runner',
    );
    expect(run).not.toHaveBeenCalled();
    expect(orchestration.grant).not.toHaveBeenCalled();
    expect(orchestration.release).toHaveBeenCalledWith({ key: 'task:TASK-21' });
  });

  it('refuses to start when orchestration occupy loses', async () => {
    const run = vi.fn();
    const orchestration = {
      ...mockOrchestration(),
      open: vi.fn().mockImplementation(() => {
        throw new OrchestrationConflictError('task:TASK-25', 99);
      }),
    };
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-25' })) },
      runner: { run, resumeReview: vi.fn() },
      livenessService: { inspect: vi.fn() },
      orchestration,
      log: () => undefined,
    });

    await expect(service.startTask({ taskId: 'TASK-25', maxRounds: 5 })).rejects.toThrow(
      'Task TASK-25 already has an active orchestration (pid 99)',
    );
    expect(run).not.toHaveBeenCalled();
    expect(orchestration.grant).not.toHaveBeenCalled();
    expect(orchestration.release).not.toHaveBeenCalled();
  });

  it('grants review after a stale review inspection', async () => {
    const existingTask = task({
      taskId: 'TASK-22',
      status: '待复核',
      workspacePath: '/workspace/task-22',
      resultSummary: 'Implementation ready',
    });
    const inspection = { state: 'stale' as const, mode: 'review' as const, round: 3, reason: 'stale runner' };
    const resumeReview = vi.fn().mockResolvedValue(undefined);
    const onRecovery = vi.fn();
    const orchestration = mockOrchestration();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(existingTask) },
      runner: { run: vi.fn(), resumeReview },
      livenessService: { inspect: vi.fn().mockResolvedValue(inspection) },
      orchestration,
      onRecovery,
      log: () => undefined,
    });

    await service.startTask({ taskId: 'TASK-22', maxRounds: 4 });

    expect(onRecovery).toHaveBeenCalledWith(inspection);
    expect(orchestration.grant).toHaveBeenCalledWith({
      key: 'task:TASK-22',
      seat: 'review',
      expectedTerm: 0,
    });
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
      orchestration: mockOrchestration(),
      log: () => undefined,
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
      orchestration: mockOrchestration(),
      log: () => undefined,
    });

    await service.startTask({ taskId: 'TASK-24', maxRounds: 4 });

    expect(run).toHaveBeenCalledWith({
      task: existingTask,
      maxRounds: 6,
      startRound: 3,
      promptOverride: expect.stringContaining('Keep the public DTO narrow'),
    });
  });

  it('keeps the 15s heartbeat timer running until release', async () => {
    const timers = fakeTimers();
    const orchestration = mockOrchestration();
    const service = new TaskStartService({
      taskService: { getTaskById: vi.fn().mockResolvedValue(task({ taskId: 'TASK-26' })) },
      runner: {
        run: async () => {
          expect(timers.size).toBe(1);
          timers.tick();
        },
        resumeReview: vi.fn(),
      },
      livenessService: { inspect: vi.fn().mockResolvedValue({ state: 'idle' }) },
      orchestration,
      timers,
      log: () => undefined,
    });

    await service.startTask({ taskId: 'TASK-26', maxRounds: 4 });
    expect(orchestration.heartbeat).toHaveBeenCalledWith({ key: 'task:TASK-26' });
    expect(timers.size).toBe(0);
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
