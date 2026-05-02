import { rm } from 'node:fs/promises';
import { execa } from 'execa';
import type { AppConfig } from '../config/schema';
import type { TaskService } from './task-service';
import type { PublishContextService } from './publish-context-service';
import { resolveTaskExecutionContext } from './task-context-service';

type ExecLike = typeof execa;
const FORCE_CLEANUP_ALLOWED_STATUSES = new Set(['待决策', '已完成', '已失败']);

export class CleanupService {
  constructor(
    private readonly deps: {
      config: AppConfig;
      taskService: Pick<TaskService, 'getTaskById' | 'updateCleanupState'>;
      publishContextService: PublishContextService;
      exec?: ExecLike;
      removeDir?: (workspacePath: string) => Promise<void>;
    },
  ) {}

  async cleanup(input: { taskId: string; force?: boolean }): Promise<{ workspacePath: string; branch: string }> {
    const task = await this.deps.taskService.getTaskById(input.taskId);
    if (!task) {
      throw new Error(`Task ${input.taskId} not found`);
    }
    const force = input.force === true;
    if (!force && task.status !== '已完成') {
      throw new Error(`Task ${task.taskId} is not completed: ${task.status}`);
    }
    if (force && !FORCE_CLEANUP_ALLOWED_STATUSES.has(task.status)) {
      throw new Error(`Task ${task.taskId} cannot be force-cleaned while status is ${task.status}`);
    }
    if (!task.workspacePath) {
      throw new Error(`Task ${task.taskId} has no workspacePath to clean up`);
    }

    const { repository } = resolveTaskExecutionContext(this.deps.config, task);
    if (repository.workspaceStrategy !== 'worktree') {
      throw new Error(`Task ${task.taskId} is using ${repository.workspaceStrategy}, not a removable worktree`);
    }

    let branch = task.publishBranch ?? '';
    let isDirty = false;
    let status = '';

    try {
      const context = await this.deps.publishContextService.load(task.workspacePath);
      branch = context.branch;
      isDirty = context.isDirty;
      status = context.status;
    } catch (error) {
      if (!force) {
        throw error;
      }
    }

    if (!force && isDirty) {
      throw new Error(
        `Task ${task.taskId} workspace is not clean and cannot be removed:\n${status || '(dirty worktree)'}`,
      );
    }

    const exec = this.deps.exec ?? execa;
    if (force) {
      const removeDir =
        this.deps.removeDir ??
        (async (workspacePath: string) => {
          await rm(workspacePath, { recursive: true, force: true, maxRetries: 3 });
        });
      await removeDir(task.workspacePath);
    } else {
      await exec('git', ['-C', repository.localPath, 'worktree', 'remove', task.workspacePath], { reject: true });
    }
    await exec('git', ['-C', repository.localPath, 'worktree', 'prune'], { reject: true });

    await this.deps.taskService.updateCleanupState(task, {
      currentOwner: '董事长',
      progressSummary: force ? '已强制清理任务工作区' : '已清理任务工作区',
    });

    return {
      workspacePath: task.workspacePath,
      branch,
    };
  }
}
