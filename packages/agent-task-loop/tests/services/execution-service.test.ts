import { describe, expect, it, vi } from 'vitest';
import { ExecutionService } from '../../src/services/execution-service';
import type { TaskRecord } from '../../src/types/task';

describe('ExecutionService', () => {
  it('claims, executes and hands task off to review on success', async () => {
    const task: TaskRecord = {
      taskId: 'TASK-1',
      title: 'Fix bug',
      description: 'desc',
      project: 'demo',
      targetAgent: 'codex',
      priority: 5,
      status: '待处理',
    };

    const taskService = {
      claimTask: vi.fn(),
      updateTaskProgress: vi.fn(),
      updateRunnerState: vi.fn(),
      updateReviewState: vi.fn(),
      markTaskSucceeded: vi.fn(),
      markTaskFailed: vi.fn(),
    };
    const execute = vi.fn().mockImplementation(async input => {
      input.onSession?.({ sessionId: 'sess-123', sessionName: 'task-1-codex' });
      input.onProgress?.('正在分析问题');
      return {
        status: 'success',
        summary: 'done',
        workspacePath: '/tmp/TASK-1-codex',
      };
    });

    const executionService = new ExecutionService({
      taskService: taskService as never,
      adapter: {
        execute,
      },
      adapterCommand: {
        command: 'codex',
        args: ['exec'],
        env: { FOO: 'bar' },
        cwd: '/tmp/TASK-1-codex',
        prompt: 'do the task',
      },
    });

    await executionService.executeTask(task, '/tmp/TASK-1-codex');

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'codex',
        args: ['exec'],
        env: { FOO: 'bar' },
        cwd: '/tmp/TASK-1-codex',
        prompt: 'do the task',
      }),
    );
    expect(taskService.claimTask).toHaveBeenCalled();
    expect(taskService.updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.taskId,
      }),
      expect.objectContaining({
        status: '待复核',
        currentOwner: 'codex',
        reviewRound: 1,
        resultSummary: 'done',
        logPath: expect.stringContaining('.agent-task-loop/logs/'),
        workspacePath: '/tmp/TASK-1-codex',
        progressSummary: '执行完成，等待 codex 复核',
      }),
    );
    expect(taskService.markTaskSucceeded).not.toHaveBeenCalled();
    expect(taskService.claimTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.taskId,
      }),
      expect.objectContaining({
        logPath: expect.stringContaining('.agent-task-loop/logs/'),
        progressSummary: expect.stringContaining('已认领'),
        sessionName: 'task-1-codex',
      }),
    );
    expect(taskService.updateTaskProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.taskId,
      }),
      expect.objectContaining({
        progressSummary: '正在分析问题',
        sessionId: 'sess-123',
        sessionName: 'task-1-codex',
        sessionHistory: expect.stringContaining('kind=execute'),
      }),
    );
    expect(taskService.updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: task.taskId }),
      expect.objectContaining({
        sessionHistory: expect.stringContaining('kind=execute'),
      }),
    );
  });

  it('marks task as 已失败 on adapter error', async () => {
    const taskService = {
      claimTask: vi.fn(),
      updateTaskProgress: vi.fn(),
      updateRunnerState: vi.fn(),
      updateReviewState: vi.fn(),
      markTaskSucceeded: vi.fn(),
      markTaskFailed: vi.fn(),
    };

    const executionService = new ExecutionService({
      taskService: taskService as never,
      adapter: {
        execute: vi.fn().mockResolvedValue({
          status: 'failure',
          summary: 'fail',
          workspacePath: '/tmp/TASK-1-codex',
          error: 'boom',
        }),
      },
      adapterCommand: {
        command: 'codex',
        args: [],
        env: {},
        cwd: '/tmp/TASK-1-codex',
        prompt: 'do the task',
      },
    });

    await executionService.executeTask(
      {
        taskId: 'TASK-1',
        title: 'Fix bug',
        description: 'desc',
        project: 'demo',
        targetAgent: 'codex',
        priority: 5,
        status: '待处理',
      },
      '/tmp/TASK-1-codex',
    );

    expect(taskService.updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'TASK-1',
      }),
      expect.objectContaining({
        status: '已失败',
        currentOwner: '董事长',
        lastError: 'boom',
        logPath: expect.stringContaining('.agent-task-loop/logs/'),
        progressSummary: '执行失败，请查看 LastError 和日志',
      }),
    );
    expect(taskService.markTaskFailed).not.toHaveBeenCalled();
  });

  it('preserves the real review round when a later repair round finishes', async () => {
    const taskService = {
      claimTask: vi.fn(),
      updateTaskProgress: vi.fn(),
      updateRunnerState: vi.fn(),
      updateReviewState: vi.fn(),
      markTaskSucceeded: vi.fn(),
      markTaskFailed: vi.fn(),
    };

    const executionService = new ExecutionService({
      taskService: taskService as never,
      adapter: {
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          summary: 'second round fixed',
          workspacePath: '/tmp/TASK-9-codex',
        }),
      },
      adapterCommand: {
        command: 'codex',
        args: [],
        env: {},
        cwd: '/tmp/TASK-9-codex',
        prompt: 'do the task',
      },
    });

    await executionService.executeTask(
      {
        taskId: 'TASK-9',
        title: 'Fix bug again',
        description: 'desc',
        project: 'demo',
        targetAgent: 'codex',
        priority: 5,
        status: '修复中',
      },
      '/tmp/TASK-9-codex',
      2,
    );

    expect(taskService.updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'TASK-9',
      }),
      expect.objectContaining({
        status: '待复核',
        reviewRound: 2,
        resultSummary: 'second round fixed',
      }),
    );
  });

  it('marks task as 已失败 when adapter throws unexpectedly', async () => {
    const taskService = {
      claimTask: vi.fn(),
      updateTaskProgress: vi.fn(),
      updateRunnerState: vi.fn(),
      updateReviewState: vi.fn(),
      markTaskSucceeded: vi.fn(),
      markTaskFailed: vi.fn(),
    };

    const executionService = new ExecutionService({
      taskService: taskService as never,
      adapter: {
        execute: vi.fn().mockRejectedValue(new Error('adapter crashed')),
      },
      adapterCommand: {
        command: 'codex',
        args: [],
        env: {},
        cwd: '/tmp/TASK-10-codex',
        prompt: 'do the task',
      },
    });

    const result = await executionService.executeTask(
      {
        taskId: 'TASK-10',
        title: 'Crash',
        description: 'desc',
        project: 'demo',
        targetAgent: 'codex',
        priority: 5,
        status: '待处理',
      },
      '/tmp/TASK-10-codex',
    );

    expect(result.status).toBe('已失败');
    expect(taskService.updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'TASK-10',
      }),
      expect.objectContaining({
        status: '已失败',
        currentOwner: '董事长',
        lastError: 'adapter crashed',
        progressSummary: '执行异常中断，请查看 LastError 和日志',
      }),
    );
  });

  it('continues execution when heartbeat persistence fails', async () => {
    const taskService = {
      claimTask: vi.fn(),
      updateTaskProgress: vi.fn(),
      updateRunnerState: vi.fn().mockRejectedValue(new Error('TLS handshake timeout')),
      updateReviewState: vi.fn(),
      markTaskSucceeded: vi.fn(),
      markTaskFailed: vi.fn(),
    };
    const execute = vi.fn().mockImplementation(async input => {
      await input.onSpawn?.({ pid: 12345 });
      await input.onHeartbeat?.();
      return {
        status: 'success',
        summary: 'done after transient heartbeat failure',
        workspacePath: '/tmp/TASK-11-codex',
      };
    });

    const executionService = new ExecutionService({
      taskService: taskService as never,
      adapter: {
        execute,
      },
      adapterCommand: {
        command: 'codex',
        args: [],
        env: {},
        cwd: '/tmp/TASK-11-codex',
        prompt: 'do the task',
      },
    });

    const result = await executionService.executeTask(
      {
        taskId: 'TASK-11',
        title: 'Transient heartbeat failure',
        description: 'desc',
        project: 'demo',
        targetAgent: 'codex',
        priority: 5,
        status: '待处理',
      },
      '/tmp/TASK-11-codex',
    );

    expect(result.status).toBe('待复核');
    expect(taskService.updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-11' }),
      expect.objectContaining({
        status: '待复核',
        resultSummary: 'done after transient heartbeat failure',
      }),
    );
  });
});
