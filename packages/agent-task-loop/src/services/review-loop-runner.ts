import { claudeAdapter } from '../adapters/claude';
import { cocoAdapter } from '../adapters/coco';
import { codexAdapter } from '../adapters/codex';
import { glmAdapter } from '../adapters/glm';
import { grokAdapter } from '../adapters/grok';
import type { AppConfig } from '../config/schema';
import { DeliveryCheckService } from './delivery-check-service';
import { ExecutionService } from './execution-service';
import { AutoPublishService } from './auto-publish-service';
import { GitPublishService } from './git-publish-service';
import { buildTaskPrompt } from './prompt-service';
import { PublishContextService } from './publish-context-service';
import { ReviewLoopService } from './review-loop-service';
import { ReviewService } from './review-service';
import { resolveTaskExecutionContext } from './task-context-service';
import type { TaskService } from './task-service';
import { ensureWorkspace } from './workspace-service';
import type { TargetAgent, TaskRecord, TaskStatus } from '../types/task';
import type { FailureMessageFormatter } from './failure-message';

const adapters = {
  claude: claudeAdapter,
  codex: codexAdapter,
  grok: grokAdapter,
  coco: cocoAdapter,
  glm: glmAdapter,
};

function buildAutoCommitMessage(input: {
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  resultSummary?: string;
}): string {
  const title = input.taskTitle.trim() || input.taskDescription.trim() || input.resultSummary?.trim() || 'task update';
  return `fix: ${title} (${input.taskId})`;
}

export class ReviewLoopRunner {
  constructor(
    private readonly deps: {
      config: AppConfig;
      taskService: TaskService;
      onBackgroundError?: (error: unknown) => void;
      formatFailure?: FailureMessageFormatter;
    },
  ) {}

  async run(input: {
    task: TaskRecord;
    maxRounds: number;
    promptOverride?: string;
    startRound?: number;
    /** Claim guard: statuses the task may be in when this run claims it. */
    claimExpectedStatuses?: TaskStatus[];
  }): Promise<void> {
    const loop = this.createLoop(input.maxRounds, {
      reviewerAgent: this.deps.config.review?.reviewerAgent ?? 'codex',
      claimExpectedStatuses:
        input.claimExpectedStatuses ??
        (input.startRound && input.startRound > 1 ? ['修复中'] : ['待处理']),
      entryRound: input.startRound ?? 1,
    });
    await loop.start({
      task: input.task,
      promptOverride: input.promptOverride,
      startRound: input.startRound,
    });
  }

  async resumeReview(input: {
    task: TaskRecord;
    maxRounds: number;
    round: number;
    workspacePath: string;
    resultSummary?: string;
  }): Promise<void> {
    const loop = this.createLoop(input.maxRounds, {
      reviewerAgent: this.deps.config.review?.reviewerAgent ?? 'codex',
    });
    await loop.resumeFromReview({
      task: input.task,
      round: input.round,
      workspacePath: input.workspacePath,
      resultSummary: input.resultSummary,
    });
  }

  private createLoop(
    maxRounds: number,
    options: {
      reviewerAgent: TargetAgent;
      /** Claim guard for the run's entry round; later rounds expect 修复中. */
      claimExpectedStatuses?: TaskStatus[];
      entryRound?: number;
    },
  ): ReviewLoopService {
    const entryRound = options.entryRound ?? 1;
    const executeRound = async (roundInput: { task: TaskRecord; promptOverride?: string; round: number }) => {
      const agent = roundInput.task.targetAgent as TargetAgent;
      const { project, repositoryKey, repository } = resolveTaskExecutionContext(this.deps.config, roundInput.task);
      const workspacePath = await ensureWorkspace({
        workspaceRoot: project.workspaceRoot,
        taskId: roundInput.task.taskId,
        agent,
        existingWorkspacePath: roundInput.task.workspacePath,
        strategy: repository.workspaceStrategy,
        repositoryPath: repository.localPath,
        defaultBranch: repository.defaultBranch,
      });
      const prompt = buildTaskPrompt({
        task: roundInput.task,
        projectName: project.name,
        repositoryKey,
        workspacePath,
        taskTemplatePrompt: project.taskTemplatePrompt,
        promptOverride: roundInput.promptOverride,
      });

      const executionService = new ExecutionService({
        taskService: this.deps.taskService,
        adapter: adapters[agent],
        adapterCommand: {
          ...this.deps.config.agents[agent],
          cwd: workspacePath,
          prompt,
        },
        claimExpectedStatuses:
          roundInput.round === entryRound ? options.claimExpectedStatuses : ['修复中'],
        reviewerAgent: options.reviewerAgent,
        onHeartbeatError: this.deps.onBackgroundError,
        formatFailure: this.deps.formatFailure,
      });
      const result = await executionService.executeTask(roundInput.task, workspacePath, roundInput.round);

      return {
        resultSummary: result.resultSummary,
        sessionId: result.executionSessionId,
        sessionName: result.executionSessionName,
        workspacePath: result.workspacePath,
        status: result.status,
      };
    };

    const deliveryCheckService = new DeliveryCheckService();
    const autoPublishService = new AutoPublishService({
      config: this.deps.config,
      publishContextService: new PublishContextService(),
      gitPublishService: new GitPublishService(),
      generateCommitMessage: async input => buildAutoCommitMessage(input),
    });

    return new ReviewLoopService({
      executeRound,
      review: async input => {
        const reviewerAgent = options.reviewerAgent;
        const reviewService = new ReviewService({
          adapter: adapters[reviewerAgent],
          command: this.deps.config.agents[reviewerAgent],
        });
        let latestRunnerPid: number | undefined;
        let latestHeartbeatAt = new Date().toISOString();
        let lastHeartbeatPersistedAt = 0;
        const persistHeartbeat = async (force = false) => {
          const now = Date.now();
          if (!force && now - lastHeartbeatPersistedAt < 15_000) {
            return;
          }

          latestHeartbeatAt = new Date(now).toISOString();
          lastHeartbeatPersistedAt = now;
          try {
            await this.deps.taskService.updateRunnerState(
              input.task as Pick<TaskRecord, 'taskId' | 'recordId'>,
              {
                runnerPid: latestRunnerPid,
                runnerKind: 'review',
                runnerAgent: reviewerAgent,
                runnerRound: input.reviewRound,
                lastHeartbeatAt: latestHeartbeatAt,
              },
            );
          } catch (error) {
            if (this.deps.onBackgroundError) {
              this.deps.onBackgroundError(error);
            } else {
              const message = error instanceof Error ? error.message : String(error);
              console.warn(`[agent-task-loop] review heartbeat update failed: ${message}`);
            }
          }
        };

        await this.deps.taskService.updateRunnerState(
          input.task as Pick<TaskRecord, 'taskId' | 'recordId'>,
          {
            runnerKind: 'review',
            runnerAgent: reviewerAgent,
            runnerRound: input.reviewRound,
            lastHeartbeatAt: latestHeartbeatAt,
          },
        );

        return reviewService.review({
          ...input,
          reviewerAgent,
          onSpawn: async payload => {
            latestRunnerPid = payload.pid;
            await persistHeartbeat(true);
          },
          onHeartbeat: async () => {
            await persistHeartbeat();
          },
        });
      },
      isTaskDeliverable: async deliveryInput => {
        const { repository } = resolveTaskExecutionContext(this.deps.config, deliveryInput.task);
        const check = await deliveryCheckService.check({
          workspacePath: deliveryInput.workspacePath,
          baseRef: repository.defaultBranch,
          publishCommit: deliveryInput.task.publishCommit,
          prLink: deliveryInput.task.prLink,
        });
        return check.isDeliverable;
      },
      publishForAcceptance: autoPublishService.publish.bind(autoPublishService),
      updatePublishResult: this.deps.taskService.updatePublishResult.bind(this.deps.taskService),
      updateReviewState: this.deps.taskService.updateReviewState.bind(this.deps.taskService),
      reviewerAgent: options.reviewerAgent,
      maxRounds,
      formatFailure: this.deps.formatFailure,
    });
  }
}
