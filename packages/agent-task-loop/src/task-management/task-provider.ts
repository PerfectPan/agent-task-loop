import type { TaskRecord, TargetAgent } from '../types/task';

export type TaskRef = Pick<TaskRecord, 'taskId' | 'recordId'>;

export interface TaskProvider {
  listTasks(): Promise<TaskRecord[]>;
  listPendingTasks(agent: TargetAgent): Promise<TaskRecord[]>;
  getTaskById(taskId: string): Promise<TaskRecord | undefined>;
  claimTask(task: TaskRef, payload: Record<string, unknown>): Promise<void>;
  updateTaskProgress(task: TaskRef, payload: Record<string, unknown>): Promise<void>;
  updateRunnerState(task: TaskRef, payload: Record<string, unknown>): Promise<void>;
  updateTaskAssignment(task: TaskRef, payload: Record<string, unknown>): Promise<void>;
  markTaskSucceeded(task: TaskRef, payload: Record<string, unknown>): Promise<void>;
  markTaskFailed(task: TaskRef, payload: Record<string, unknown>): Promise<void>;
  updateReviewState(task: TaskRef, payload: Record<string, unknown>): Promise<void>;
  updatePublishResult(task: TaskRef, payload: Record<string, unknown>): Promise<void>;
  updateCleanupState(task: TaskRef, payload: Record<string, unknown>): Promise<void>;
}
