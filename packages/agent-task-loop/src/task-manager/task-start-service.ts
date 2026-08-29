import { OrchestrationConflictError } from '@rivus/agent-orchestration';
import { createTaskOrchestration, taskOrchestrationKey } from '../orchestration/task-orchestration';
import type { ReviewLoopRunner } from '../services/review-loop-runner';
import { buildReworkPrompt } from '../services/rework-prompt-service';
import type { TaskRunnerInspection, TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
import type { TaskService } from '../services/task-service';
import type { TaskRecord } from '../types/task';
import type { StartTaskInput } from './task-manager-application';
import { TaskManagerInputError } from './task-manager-error';

type TaskRunWorkflow = Pick<ReviewLoopRunner, 'run' | 'resumeReview'>;
type TaskReader = Pick<TaskService, 'getTaskById'>;
type TaskRunnerLiveness = Pick<TaskRunnerLivenessService, 'inspect'>;
type TaskOrchestration = {
  open(input: {
    key: string;
    template: string;
    bind?: Record<string, { cmd: string }>;
    context?: { goal?: string; ref?: Record<string, string> };
  }): Promise<unknown>;
  release(key: string): void;
};

export interface TaskStartServiceDependencies {
  taskService: TaskReader;
  runner: TaskRunWorkflow;
  livenessService: TaskRunnerLiveness;
  orchestration?: TaskOrchestration;
  onRecovery?: (inspection: TaskRunnerInspection) => void;
}

export class TaskStartService {
  private readonly orchestration: TaskOrchestration;

  constructor(private readonly dependencies: TaskStartServiceDependencies) {
    this.orchestration = dependencies.orchestration ?? createTaskOrchestration();
  }

  async startTask(input: StartTaskInput): Promise<TaskRecord> {
    const task = await this.dependencies.taskService.getTaskById(input.taskId);
    if (!task) {
      throw new TaskManagerInputError('task-not-found', `Task ${input.taskId} not found`);
    }

    if (input.targetAgent) {
      task.targetAgent = input.targetAgent;
      task.currentOwner = input.targetAgent;
    }

    const key = taskOrchestrationKey(task.taskId);
    try {
      await this.orchestration.open({
        key,
        template: 'classic-delivery',
        context: {
          goal: task.title || task.description,
          ref: { taskId: task.taskId },
        },
      });
    } catch (error) {
      if (error instanceof OrchestrationConflictError) {
        throw new Error(
          `Task ${task.taskId} already has an active orchestration` +
            (error.holderPid !== undefined ? ` (pid ${error.holderPid})` : ''),
        );
      }
      throw error;
    }

    try {
      return await this.runOccupied(input, task);
    } finally {
      this.orchestration.release(key);
    }
  }

  private async runOccupied(input: StartTaskInput, task: TaskRecord): Promise<TaskRecord> {
    const inspection = await this.dependencies.livenessService.inspect(task);
    if (inspection.state === 'active') {
      throw new Error(`Task ${task.taskId} already has an active ${inspection.mode} runner`);
    }
    if (inspection.state === 'stale') {
      this.dependencies.onRecovery?.(inspection);
      const maxRounds = maxRoundsForStartRound(input.maxRounds, inspection.round);
      if (inspection.mode === 'review') {
        await this.dependencies.runner.resumeReview({
          task,
          maxRounds,
          round: inspection.round ?? task.reviewRound ?? 1,
          workspacePath: task.workspacePath ?? '',
          resultSummary: task.resultSummary,
        });
      } else {
        await this.dependencies.runner.run({
          task,
          maxRounds,
          promptOverride: inspection.promptOverride,
          startRound: inspection.round,
        });
      }
      return task;
    }

    const recoveryStartRound = task.status === '已失败' ? (task.reviewRound ?? 0) + 1 : undefined;
    await this.dependencies.runner.run({
      task,
      maxRounds: maxRoundsForStartRound(input.maxRounds, recoveryStartRound),
      ...(recoveryStartRound ? {
        startRound: recoveryStartRound,
        promptOverride: buildReworkPrompt({
          taskDescription: task.description,
          resultSummary: task.resultSummary,
          reviewFindings: task.reviewFindings,
          acceptanceFeedback: task.acceptanceFeedback,
        }),
      } : {}),
    });
    return task;
  }
}

function maxRoundsForStartRound(configuredMaxRounds: number, startRound?: number): number {
  return startRound ? Math.max(configuredMaxRounds, startRound + configuredMaxRounds - 1) : configuredMaxRounds;
}
