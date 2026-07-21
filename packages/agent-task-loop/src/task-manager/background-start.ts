import type { ReviewLoopRunner } from '../services/review-loop-runner';
import type { TaskRunnerInspection, TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
import type { TaskProvider } from '../task-management/task-provider';
import type { TaskRecord } from '../types/task';
import type { StartTaskInput } from './task-manager-application';
import { TaskManagerInputError } from './task-manager-error';
import { toPublicTask, type PublicTaskDto } from './public-task';

/**
 * Coarse run phase exposed to the desktop UI.
 * Deliberately excludes PID, session id, or any process forensics.
 */
export type RunPhase = 'idle' | 'starting' | 'running' | 'recovering' | 'failed' | 'unknown';

export interface BackgroundStartResult {
  action: 'started';
  task: PublicTaskDto;
  taskId: string;
  runPhase: RunPhase;
}

export interface BackgroundStartDependencies {
  taskProvider: Pick<TaskProvider, 'getTaskById'>;
  runner: Pick<ReviewLoopRunner, 'run' | 'resumeReview'>;
  livenessService: Pick<TaskRunnerLivenessService, 'inspect'>;
  onRecovery?: (inspection: TaskRunnerInspection) => void;
}

/**
 * In-memory registry tracking the coarse run phase of each task.
 * Used by the desktop server for SSE `runPhase` projections.
 */
export class RunPhaseRegistry {
  private readonly phases = new Map<string, RunPhase>();

  get(taskId: string): RunPhase {
    return this.phases.get(taskId) ?? 'idle';
  }

  set(taskId: string, phase: RunPhase): void {
    this.phases.set(taskId, phase);
  }

  clear(taskId: string): void {
    this.phases.delete(taskId);
  }
}

/**
 * Desktop-only background start port.
 *
 * Performs the same preflight / liveness check as `TaskStartService` but does
 * NOT await the full review loop on the request path. The loop runs in the
 * background and its phase is tracked in the `RunPhaseRegistry`.
 *
 * This must NOT be used by the Rivus Plugin, which keeps awaiting completion
 * via the existing `startTask`.
 */
export class BackgroundStartService {
  readonly registry = new RunPhaseRegistry();

  constructor(private readonly deps: BackgroundStartDependencies) {}

  async startTaskBackground(input: StartTaskInput): Promise<BackgroundStartResult> {
    // Preflight: replicate the get + liveness check so errors surface before
    // the HTTP response returns (e.g. task-not-found, task-already-active).
    const task = await this.deps.taskProvider.getTaskById(input.taskId);
    if (!task) {
      throw new TaskManagerInputError('task-not-found', `Task ${input.taskId} not found`);
    }

    if (input.targetAgent) {
      task.targetAgent = input.targetAgent;
      task.currentOwner = input.targetAgent;
    }

    const inspection = await this.deps.livenessService.inspect(task);
    if (inspection.state === 'active') {
      throw new TaskManagerInputError(
        'task-already-active',
        `Task ${task.taskId} already has an active runner`,
      );
    }

    const runPhase: RunPhase = inspection.state === 'stale' ? 'recovering' : 'running';
    this.registry.set(task.taskId, runPhase);

    // Fire-and-forget: do not await the full loop on the request path.
    this.runLoop(task, input, inspection).catch(() => {
      this.registry.set(task.taskId, 'failed');
    });

    return {
      action: 'started',
      task: toPublicTask(task),
      taskId: task.taskId,
      runPhase,
    };
  }

  private async runLoop(
    task: TaskRecord,
    input: StartTaskInput,
    inspection: TaskRunnerInspection,
  ): Promise<void> {
    if (inspection.state === 'stale') {
      this.deps.onRecovery?.(inspection);
      const maxRounds = maxRoundsForStartRound(input.maxRounds, inspection.round);
      if (inspection.mode === 'review') {
        await this.deps.runner.resumeReview({
          task,
          maxRounds,
          round: inspection.round ?? task.reviewRound ?? 1,
          workspacePath: task.workspacePath ?? '',
          resultSummary: task.resultSummary,
        });
      } else {
        await this.deps.runner.run({
          task,
          maxRounds,
          promptOverride: inspection.promptOverride,
          startRound: inspection.round,
        });
      }
      return;
    }

    const recoveryStartRound = task.status === '已失败' ? (task.reviewRound ?? 0) + 1 : undefined;
    await this.deps.runner.run({
      task,
      maxRounds: maxRoundsForStartRound(input.maxRounds, recoveryStartRound),
      ...(recoveryStartRound ? { startRound: recoveryStartRound } : {}),
    });
  }
}

function maxRoundsForStartRound(configuredMaxRounds: number, startRound?: number): number {
  return startRound ? Math.max(configuredMaxRounds, startRound + configuredMaxRounds - 1) : configuredMaxRounds;
}
