import type { AppConfig } from '../config/schema';
import {
  buildTaskProvider,
  type BuildTaskProviderOptions,
} from '../task-management/build-task-provider';
import type {
  ClaimTaskPayload,
  CreateTaskPayload,
  MarkTaskFailedPayload,
  MarkTaskSucceededPayload,
  TaskProvider,
  TaskRef,
  UpdateCleanupStatePayload,
  UpdatePublishResultPayload,
  UpdateReviewStatePayload,
  UpdateRunnerStatePayload,
  UpdateTaskAssignmentPayload,
  UpdateTaskProgressPayload,
} from '../task-management/task-provider';
import type { TargetAgent, TaskRecord } from '../types/task';

function isTaskProvider(input: AppConfig | TaskProvider): input is TaskProvider {
  return typeof (input as TaskProvider).listTasks === 'function';
}

/** Serializes one Task mutation under the caller's current occupancy lease. */
export interface TaskMutationFence {
  run<T>(mutation: () => Promise<T>): Promise<T>;
}

export class TaskService implements TaskProvider {
  private readonly provider: TaskProvider;

  constructor(
    input: AppConfig | TaskProvider,
    options: BuildTaskProviderOptions = {},
    private readonly mutationFence?: TaskMutationFence,
  ) {
    this.provider = isTaskProvider(input) ? input : buildTaskProvider(input, options);
  }

  withMutationFence(fence: TaskMutationFence): TaskService {
    return new TaskService(this.provider, {}, fence);
  }

  private async mutate(mutation: () => Promise<void>): Promise<void> {
    if (this.mutationFence) {
      await this.mutationFence.run(mutation);
      return;
    }
    await mutation();
  }

  async listPendingTasks(agent: TargetAgent): Promise<TaskRecord[]> {
    return this.provider.listPendingTasks(agent);
  }

  async getTaskById(taskId: string): Promise<TaskRecord | undefined> {
    return this.provider.getTaskById(taskId);
  }

  async listTasks(): Promise<TaskRecord[]> {
    return this.provider.listTasks();
  }

  async createTask(payload: CreateTaskPayload): Promise<void> {
    await this.mutate(() => this.provider.createTask(payload));
  }

  async claimTask(task: TaskRef, payload: ClaimTaskPayload): Promise<void> {
    await this.mutate(() => this.provider.claimTask(task, payload));
  }

  async updateTaskProgress(task: TaskRef, payload: UpdateTaskProgressPayload): Promise<void> {
    await this.mutate(() => this.provider.updateTaskProgress(task, payload));
  }

  async updateRunnerState(task: TaskRef, payload: UpdateRunnerStatePayload): Promise<void> {
    await this.mutate(() => this.provider.updateRunnerState(task, payload));
  }

  async updateTaskAssignment(task: TaskRef, payload: UpdateTaskAssignmentPayload): Promise<void> {
    await this.mutate(() => this.provider.updateTaskAssignment(task, payload));
  }

  async markTaskSucceeded(task: TaskRef, payload: MarkTaskSucceededPayload): Promise<void> {
    await this.mutate(() => this.provider.markTaskSucceeded(task, payload));
  }

  async markTaskFailed(task: TaskRef, payload: MarkTaskFailedPayload): Promise<void> {
    await this.mutate(() => this.provider.markTaskFailed(task, payload));
  }

  async updateReviewState(task: TaskRef, payload: UpdateReviewStatePayload): Promise<void> {
    await this.mutate(() => this.provider.updateReviewState(task, payload));
  }

  async updatePublishResult(task: TaskRef, payload: UpdatePublishResultPayload): Promise<void> {
    await this.mutate(() => this.provider.updatePublishResult(task, payload));
  }

  async updateCleanupState(task: TaskRef, payload: UpdateCleanupStatePayload): Promise<void> {
    await this.mutate(() => this.provider.updateCleanupState(task, payload));
  }
}
