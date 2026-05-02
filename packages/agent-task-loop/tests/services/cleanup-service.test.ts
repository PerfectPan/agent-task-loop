import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { CleanupService } from '../../src/services/cleanup-service';

const config = {
  feishu: { baseToken: 'base', tableId: 'table' },
  projects: {
    demo: {
      key: 'demo',
      name: 'Demo',
      defaultRepository: 'demo',
      workspaceRoot: '/tmp/worktrees',
      taskTemplatePrompt: '',
    },
  },
  repositories: {
    demo: {
      key: 'demo',
      localPath: '/tmp/demo',
      defaultBranch: 'master',
      installCommand: 'rush update',
      testCommand: 'rush test',
      buildCommand: 'rush build',
      workspaceStrategy: 'worktree',
    },
    app: {
      key: 'app',
      localPath: '/tmp/app',
      defaultBranch: 'master',
      installCommand: 'pnpm install',
      testCommand: 'pnpm test',
      buildCommand: 'pnpm build',
      workspaceStrategy: 'existing-repo',
    },
  },
  agents: {},
} as unknown as AppConfig;

describe('CleanupService', () => {
  it('removes a clean completed worktree and clears workspace metadata', async () => {
    const taskService = {
      getTaskById: vi.fn().mockResolvedValue({
        taskId: 'TASK-102',
        title: 'done',
        description: 'desc',
        status: '已完成',
        workspacePath: '/tmp/worktrees/TASK-102',
        project: 'demo',
        repository: 'demo',
        targetAgent: 'codex',
        priority: 1,
      }),
      updateCleanupState: vi.fn(),
    };
    const exec = vi.fn().mockResolvedValue({ stdout: '' });
    const removeDir = vi.fn().mockResolvedValue(undefined);

    const service = new CleanupService({
      config,
      taskService: taskService as never,
      publishContextService: {
        load: vi.fn().mockResolvedValue({
          workspacePath: '/tmp/worktrees/TASK-102',
          branch: 'task/task-102',
          headCommit: 'abc123',
          isDirty: false,
          diffStat: '',
          diff: '',
          status: '',
        }),
      } as never,
      exec: exec as never,
    });

    const result = await service.cleanup({ taskId: 'TASK-102' });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      'git',
      ['-C', '/tmp/demo', 'worktree', 'remove', '/tmp/worktrees/TASK-102'],
      { reject: true },
    );
    expect(exec).toHaveBeenNthCalledWith(2, 'git', ['-C', '/tmp/demo', 'worktree', 'prune'], { reject: true });
    expect(taskService.updateCleanupState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-102' }),
      expect.objectContaining({ progressSummary: '已清理任务工作区' }),
    );
    expect(result).toEqual({
      branch: 'task/task-102',
      workspacePath: '/tmp/worktrees/TASK-102',
    });
  });

  it('refuses to remove a dirty worktree', async () => {
    const taskService = {
      getTaskById: vi.fn().mockResolvedValue({
        taskId: 'TASK-102',
        title: 'done',
        description: 'desc',
        status: '已完成',
        workspacePath: '/tmp/worktrees/TASK-102',
        project: 'demo',
        repository: 'demo',
        targetAgent: 'codex',
        priority: 1,
      }),
      updateCleanupState: vi.fn(),
    };

    const service = new CleanupService({
      config,
      taskService: taskService as never,
      publishContextService: {
        load: vi.fn().mockResolvedValue({
          workspacePath: '/tmp/worktrees/TASK-102',
          branch: 'task/task-102',
          headCommit: 'abc123',
          isDirty: true,
          diffStat: ' file | 1 +',
          diff: 'diff --git',
          status: ' M file',
        }),
      } as never,
    });

    await expect(service.cleanup({ taskId: 'TASK-102' })).rejects.toThrow('workspace is not clean');
    expect(taskService.updateCleanupState).not.toHaveBeenCalled();
  });

  it('refuses to clean an existing-repo workspace', async () => {
    const taskService = {
      getTaskById: vi.fn().mockResolvedValue({
        taskId: 'TASK-999',
        title: 'done',
        description: 'desc',
        status: '已完成',
        workspacePath: '/tmp/app',
        project: 'demo',
        repository: 'app',
        targetAgent: 'codex',
        priority: 1,
      }),
      updateCleanupState: vi.fn(),
    };

    const service = new CleanupService({
      config,
      taskService: taskService as never,
      publishContextService: {
        load: vi.fn(),
      } as never,
    });

    await expect(service.cleanup({ taskId: 'TASK-999' })).rejects.toThrow('not a removable worktree');
  });

  it('force-cleans a dirty terminal-state worktree', async () => {
    const taskService = {
      getTaskById: vi.fn().mockResolvedValue({
        taskId: 'TASK-102',
        title: 'done',
        description: 'desc',
        status: '待决策',
        workspacePath: '/tmp/worktrees/TASK-102',
        publishBranch: 'task/task-102',
        project: 'demo',
        repository: 'demo',
        targetAgent: 'codex',
        priority: 1,
      }),
      updateCleanupState: vi.fn(),
    };
    const exec = vi.fn().mockResolvedValue({ stdout: '' });
    const removeDir = vi.fn().mockResolvedValue(undefined);

    const service = new CleanupService({
      config,
      taskService: taskService as never,
      publishContextService: {
        load: vi.fn().mockResolvedValue({
          workspacePath: '/tmp/worktrees/TASK-102',
          branch: 'task/task-102',
          headCommit: 'abc123',
          isDirty: true,
          diffStat: ' file | 1 +',
          diff: 'diff --git',
          status: ' M file',
        }),
      } as never,
      exec: exec as never,
      removeDir,
    });

    const result = await service.cleanup({ taskId: 'TASK-102', force: true });

    expect(removeDir).toHaveBeenCalledWith('/tmp/worktrees/TASK-102');
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('git', ['-C', '/tmp/demo', 'worktree', 'prune'], { reject: true });
    expect(taskService.updateCleanupState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-102' }),
      expect.objectContaining({ progressSummary: '已强制清理任务工作区' }),
    );
    expect(result).toEqual({
      branch: 'task/task-102',
      workspacePath: '/tmp/worktrees/TASK-102',
    });
  });

  it('refuses to force-clean a running task', async () => {
    const taskService = {
      getTaskById: vi.fn().mockResolvedValue({
        taskId: 'TASK-103',
        title: 'running',
        description: 'desc',
        status: '执行中',
        workspacePath: '/tmp/worktrees/TASK-103',
        project: 'demo',
        repository: 'demo',
        targetAgent: 'codex',
        priority: 1,
      }),
      updateCleanupState: vi.fn(),
    };

    const service = new CleanupService({
      config,
      taskService: taskService as never,
      publishContextService: {
        load: vi.fn(),
      } as never,
    });

    await expect(service.cleanup({ taskId: 'TASK-103', force: true })).rejects.toThrow('cannot be force-cleaned');
  });
});
