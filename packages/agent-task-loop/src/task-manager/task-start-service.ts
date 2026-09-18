import type { ReviewLoopRunner } from '../services/review-loop-runner';
import { buildReworkPrompt } from '../services/rework-prompt-service';
import type { TaskRunnerInspection, TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
import type { TaskService } from '../services/task-service';
import type { TaskMutationFence } from '../services/task-service';
import type { TaskRecord } from '../types/task';
import type { StartTaskInput } from './task-manager-application';
import { TaskManagerInputError } from './task-manager-error';
import { TaskOccupancyService, type TaskOrchestration } from './task-occupancy-service';

type TaskRunInput = Parameters<ReviewLoopRunner['run']>[0];
type TaskResumeInput = Parameters<ReviewLoopRunner['resumeReview']>[0];
type TaskRunWorkflow = {
  run(input: TaskRunInput): Promise<void>;
  resumeReview(input: TaskResumeInput): Promise<void>;
};
type TaskReader = Pick<TaskService, 'getTaskById'>;
type TaskRunnerLiveness = Pick<TaskRunnerLivenessService, 'inspect'>;
export interface TaskStartServiceDependencies {
  taskService: TaskReader;
  runner: TaskRunWorkflow;
  livenessService: TaskRunnerLiveness;
  orchestration?: TaskOrchestration;
  occupancyHeartbeatMs?: number;
  onRecovery?: (inspection: TaskRunnerInspection) => void;
}

export class TaskStartService {
  private readonly occupancy: TaskOccupancyService;

  constructor(private readonly dependencies: TaskStartServiceDependencies) {
    this.occupancy = new TaskOccupancyService(
      dependencies.orchestration,
      dependencies.occupancyHeartbeatMs,
    );
  }

  async startTask(input: StartTaskInput): Promise<TaskRecord> {
    const task = await this.dependencies.taskService.getTaskById(input.taskId);
    if (!task) {
      throw new TaskManagerInputError('task-not-found', `Task ${input.taskId} not found`);
    }

    return this.occupancy.run(
      { taskId: task.taskId, goal: task.title || task.description },
      ({ signal, mutationFence }) => {
        if (input.targetAgent) {
          task.targetAgent = input.targetAgent;
          task.currentOwner = input.targetAgent;
        }
        return this.runOccupied(input, task, signal, mutationFence);
      },
    );
  }

  private async runOccupied(
    input: StartTaskInput,
    task: TaskRecord,
    signal: AbortSignal,
    mutationFence: TaskMutationFence,
  ): Promise<TaskRecord> {
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
          signal,
          mutationFence,
        });
      } else {
        await this.dependencies.runner.run({
          task,
          maxRounds,
          promptOverride: inspection.promptOverride,
          startRound: inspection.round,
          signal,
          mutationFence,
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
      signal,
      mutationFence,
    });
    return task;
  }
}

function maxRoundsForStartRound(configuredMaxRounds: number, startRound?: number): number {
  return startRound ? Math.max(configuredMaxRounds, startRound + configuredMaxRounds - 1) : configuredMaxRounds;
}
