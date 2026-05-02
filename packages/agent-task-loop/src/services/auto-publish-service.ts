import type { AppConfig } from '../config/schema';
import type { TaskRecord } from '../types/task';
import { resolveTaskExecutionContext } from './task-context-service';
import type { PublishContextService } from './publish-context-service';
import type { GitPublishService } from './git-publish-service';

export class AutoPublishService {
  constructor(
    private readonly deps: {
      config: AppConfig;
      publishContextService: PublishContextService;
      gitPublishService: Pick<GitPublishService, 'commitAll' | 'pushBranch' | 'getRemoteBranchHead'>;
      generateCommitMessage: (input: {
        taskId: string;
        taskTitle: string;
        taskDescription: string;
        resultSummary?: string;
        diffStat?: string;
        diff?: string;
      }) => Promise<string>;
    },
  ) {}

  async publish(task: TaskRecord, workspacePath: string): Promise<{ branch: string; commit: string }> {
    let context = await this.deps.publishContextService.load(workspacePath);
    const { repository } = resolveTaskExecutionContext(this.deps.config, task);

    if (repository.defaultBranch === context.branch) {
      throw new Error(`refusing to use default branch ${context.branch} as task publish branch`);
    }

    if (context.isDirty) {
      const message = await this.deps.generateCommitMessage({
        taskId: task.taskId,
        taskTitle: task.title,
        taskDescription: task.description,
        resultSummary: task.resultSummary,
        diffStat: context.diffStat,
        diff: context.diff,
      });

      await this.deps.gitPublishService.commitAll({
        workspacePath,
        message,
      });
      context = await this.deps.publishContextService.load(workspacePath);
    }

    await this.deps.gitPublishService.pushBranch({
      workspacePath,
      branch: context.branch,
    });

    const remoteHead = await this.deps.gitPublishService.getRemoteBranchHead({
      workspacePath,
      branch: context.branch,
    });

    if (!remoteHead || remoteHead !== context.headCommit) {
      throw new Error(`push verification failed for branch ${context.branch}`);
    }

    return {
      branch: context.branch,
      commit: context.headCommit,
    };
  }
}
