import type { TargetAgent, TaskRecord } from '../types/task';
import { overlayRuntimeState, pickRuntimeState } from './runtime-state';
import type { TaskStateStore } from './task-state-store';
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
} from './task-provider';

/**
 * Cross-cutting decorator that gives the loop a source-agnostic home for its
 * run-time state. It wraps any {@link TaskProvider} (leaf or composite) and a
 * {@link TaskStateStore}:
 *
 * - writes mirror the run-time field subset to the store (keyed by the stable
 *   `recordId`), then delegate to the inner provider unchanged;
 * - reads overlay the stored fields onto each record (local authoritative for
 *   the run-time subset, backend as fallback).
 *
 * The inner providers never see the store. All store access is best-effort: a
 * store failure is swallowed so it can never break a source write or a read.
 */
export class StatefulTaskProvider implements TaskProvider {
  constructor(
    private readonly inner: TaskProvider,
    private readonly store: TaskStateStore,
  ) {}

  /** Transparent passthrough of the inner provider's source identity, if any. */
  get source(): string | undefined {
    return (this.inner as { source?: string }).source;
  }

  /** Transparent passthrough of a composite inner provider's source list, if any. */
  get sources(): string[] | undefined {
    return (this.inner as { sources?: string[] }).sources;
  }

  private overlay(record: TaskRecord): TaskRecord {
    if (!record.source || !record.recordId) {
      return record;
    }
    try {
      return overlayRuntimeState(record, this.store.read(record.source, record.recordId));
    } catch {
      return record;
    }
  }

  private mirror(task: TaskRef, payload: object): void {
    if (!task.source || !task.recordId) {
      return;
    }
    try {
      this.store.merge(task.source, task.recordId, pickRuntimeState(payload));
    } catch {
      // best-effort
    }
  }

  async listTasks(): Promise<TaskRecord[]> {
    return (await this.inner.listTasks()).map(record => this.overlay(record));
  }

  async listPendingTasks(agent: TargetAgent): Promise<TaskRecord[]> {
    return (await this.inner.listPendingTasks(agent)).map(record => this.overlay(record));
  }

  async getTaskById(taskId: string): Promise<TaskRecord | undefined> {
    const task = await this.inner.getTaskById(taskId);
    return task ? this.overlay(task) : undefined;
  }

  async createTask(payload: CreateTaskPayload): Promise<void> {
    // No recordId yet and no run-time fields — nothing to mirror.
    await this.inner.createTask(payload);
  }

  async claimTask(task: TaskRef, payload: ClaimTaskPayload): Promise<void> {
    this.mirror(task, payload);
    await this.inner.claimTask(task, payload);
  }

  async updateTaskProgress(task: TaskRef, payload: UpdateTaskProgressPayload): Promise<void> {
    this.mirror(task, payload);
    await this.inner.updateTaskProgress(task, payload);
  }

  async updateRunnerState(task: TaskRef, payload: UpdateRunnerStatePayload): Promise<void> {
    this.mirror(task, payload);
    await this.inner.updateRunnerState(task, payload);
  }

  async updateTaskAssignment(task: TaskRef, payload: UpdateTaskAssignmentPayload): Promise<void> {
    this.mirror(task, payload);
    await this.inner.updateTaskAssignment(task, payload);
  }

  async markTaskSucceeded(task: TaskRef, payload: MarkTaskSucceededPayload): Promise<void> {
    this.mirror(task, payload);
    await this.inner.markTaskSucceeded(task, payload);
  }

  async markTaskFailed(task: TaskRef, payload: MarkTaskFailedPayload): Promise<void> {
    this.mirror(task, payload);
    await this.inner.markTaskFailed(task, payload);
  }

  async updateReviewState(task: TaskRef, payload: UpdateReviewStatePayload): Promise<void> {
    this.mirror(task, payload);
    await this.inner.updateReviewState(task, payload);
  }

  async updatePublishResult(task: TaskRef, payload: UpdatePublishResultPayload): Promise<void> {
    this.mirror(task, payload);
    await this.inner.updatePublishResult(task, payload);
  }

  async updateCleanupState(task: TaskRef, payload: UpdateCleanupStatePayload): Promise<void> {
    try {
      await this.inner.updateCleanupState(task, payload);
    } finally {
      // Clear regardless of the delegate's outcome so run-time state never
      // outlives the task; the TTL sweep is the backstop if this also fails.
      if (task.source && task.recordId) {
        try {
          this.store.clear(task.source, task.recordId);
        } catch {
          // best-effort
        }
      }
    }
  }
}
