import { OrchestrationConflictError } from '@rivus/agent-orchestration';
import { createTaskOrchestration, taskOrchestrationKey } from '../orchestration/task-orchestration';
import type { TaskMutationFence } from '../services/task-service';

export interface TaskOrchestration {
  open(input: {
    key: string;
    template: string;
    bind?: Record<string, { cmd: string }>;
    context?: { goal?: string; ref?: Record<string, string> };
  }): Promise<unknown>;
  heartbeat(key: string): void;
  release(key: string): void;
  fence<T>(key: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

export interface TaskOccupancyContext {
  signal: AbortSignal;
  mutationFence: TaskMutationFence;
}

/** Owns the lifecycle and external-write fence for one occupied Task run. */
export class TaskOccupancyService {
  private readonly orchestration: TaskOrchestration;

  constructor(
    orchestration?: TaskOrchestration,
    private readonly heartbeatMs = 15_000,
  ) {
    this.orchestration = orchestration ?? createTaskOrchestration();
  }

  async run<T>(
    input: { taskId: string; goal?: string },
    workflow: (context: TaskOccupancyContext) => Promise<T>,
  ): Promise<T> {
    const key = taskOrchestrationKey(input.taskId);
    try {
      await this.orchestration.open({
        key,
        template: 'classic-delivery',
        context: {
          goal: input.goal,
          ref: { taskId: input.taskId },
        },
      });
    } catch (error) {
      if (error instanceof OrchestrationConflictError) {
        throw new Error(
          `Task ${input.taskId} already has an active orchestration` +
            (error.holderPid !== undefined ? ` (pid ${error.holderPid})` : ''),
        );
      }
      throw error;
    }

    const controller = new AbortController();
    let leaseError: unknown;
    const timer = setInterval(() => {
      try {
        this.orchestration.heartbeat(key);
      } catch (error) {
        leaseError ??= error;
        controller.abort(error);
      }
    }, this.heartbeatMs);
    timer.unref();
    const mutationFence: TaskMutationFence = {
      run: mutation => this.orchestration.fence(key, mutation, controller.signal),
    };

    try {
      const result = await workflow({ signal: controller.signal, mutationFence });
      if (leaseError) throw leaseError;
      return result;
    } finally {
      clearInterval(timer);
      this.orchestration.release(key);
    }
  }
}
