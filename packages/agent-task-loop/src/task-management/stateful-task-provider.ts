import type { TargetAgent, TaskRecord } from '../types/task';
import { overlayRuntimeState, pickRuntimeState, type RuntimeTaskState } from './runtime-state';

/**
 * Run-time fields cleared on cleanup, mirroring Feishu's `updateCleanupState`.
 * The lifecycle `status`, result summary, PR link, publish info and session
 * history / ids are deliberately KEPT so a finished task still shows its outcome
 * and transcript, and never resurrects to 待处理 on a binary backend (GitHub).
 */
const CLEANUP_CLEARED_STATE = {
  workspacePath: '',
  logPath: '',
  reviewLogPath: '',
  runnerPid: null,
  runnerKind: '',
  runnerAgent: '',
  runnerRound: null,
  lastHeartbeatAt: '',
  lastError: '',
  reviewVerdict: '',
  reviewFindings: '',
  acceptanceVerdict: '',
  acceptanceFeedback: '',
} as unknown as RuntimeTaskState;
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
    // Filter on the OVERLAID status, not the inner provider's. A low-fidelity
    // backend (GitHub open/closed) reports an in-flight or finished task back as
    // 待处理 on its raw record; only after overlaying the run-time store does the
    // true status (执行中 / 已失败 / 已完成 / …) appear. Delegating the filter to
    // the inner provider would re-offer such a task as pending — re-claimable.
    return (await this.listTasks()).filter(task => task.targetAgent === agent && task.status === '待处理');
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
    // Claiming means the task is now executing; inject the implied status so a
    // low-fidelity backend (GitHub open/closed) doesn't report it back as 待处理
    // and let it be re-claimed.
    this.mirror(task, { ...payload, status: '执行中' });
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
    // Execution succeeded ⇒ awaiting acceptance. Mirror the SAME status the
    // full-fidelity backend writes (Feishu sets 待验收) so a low-fidelity backend
    // reports it back identically. The terminal 已完成 is set later, by complete
    // via updateReviewState.
    this.mirror(task, { ...payload, status: '待验收' });
    await this.inner.markTaskSucceeded(task, payload);
  }

  async markTaskFailed(task: TaskRef, payload: MarkTaskFailedPayload): Promise<void> {
    this.mirror(task, { ...payload, status: '已失败' });
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
      // Mirror Feishu's cleanup: clear the transient run-time fields but KEEP
      // the lifecycle status, result, PR link, publish info and session history.
      // A finished task must still show its outcome + transcript, and must never
      // resurrect to 待处理 once the binary backend's store is touched.
      if (task.source && task.recordId) {
        try {
          this.store.merge(task.source, task.recordId, CLEANUP_CLEARED_STATE);
        } catch {
          // best-effort
        }
      }
    }
  }
}
