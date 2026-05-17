import type { AppConfig } from '../config/schema';
import { FeishuTaskProvider } from '../task-management/feishu-task-provider';
import type { TaskProvider, TaskRef } from '../task-management/task-provider';
import type { TargetAgent, TaskRecord } from '../types/task';

function isTaskProvider(input: AppConfig | TaskProvider): input is TaskProvider {
  return typeof (input as TaskProvider).listTasks === 'function';
}

export class TaskService implements TaskProvider {
  private readonly provider: TaskProvider;

  constructor(input: AppConfig | TaskProvider) {
    this.provider = isTaskProvider(input) ? input : new FeishuTaskProvider(input);
  }

  async listPendingTasks(agent: TargetAgent): Promise<TaskRecord[]> {
    return (await this.provider.listTasks()).filter(task => task.targetAgent === agent && task.status === '待处理');
  }

  async getTaskById(taskId: string): Promise<TaskRecord | undefined> {
    return (await this.provider.listTasks()).find(task => task.taskId === taskId);
  }

  async listTasks(): Promise<TaskRecord[]> {
    return this.provider.listTasks();
  }

  async claimTask(task: TaskRef, payload: Record<string, unknown>): Promise<void> {
    await this.provider.claimTask(task, payload);
  }

  async updateTaskProgress(task: TaskRef, payload: Record<string, unknown>): Promise<void> {
    await this.provider.updateTaskProgress(task, payload);
  }

  async updateRunnerState(task: TaskRef, payload: Record<string, unknown>): Promise<void> {
    await this.provider.updateRunnerState(task, payload);
  }

  async updateTaskAssignment(task: TaskRef, payload: Record<string, unknown>): Promise<void> {
    await this.provider.updateTaskAssignment(task, payload);
  }

  async markTaskSucceeded(task: TaskRef, payload: Record<string, unknown>): Promise<void> {
    await this.provider.markTaskSucceeded(task, payload);
  }

  async markTaskFailed(task: TaskRef, payload: Record<string, unknown>): Promise<void> {
    await this.provider.markTaskFailed(task, payload);
  }

  async updateReviewState(task: TaskRef, payload: Record<string, unknown>): Promise<void> {
    await this.provider.updateReviewState(task, payload);
  }

  async updatePublishResult(task: TaskRef, payload: Record<string, unknown>): Promise<void> {
    await this.provider.updatePublishResult(task, payload);
  }

  async updateCleanupState(task: TaskRef, payload: Record<string, unknown>): Promise<void> {
    await this.provider.updateCleanupState(task, payload);
  }
}
