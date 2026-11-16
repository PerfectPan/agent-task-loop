import type { AcceptanceVerdict, ReviewVerdict, TaskRecord, TargetAgent, TaskStatus } from '../types/task';

export type TaskRef = Pick<TaskRecord, 'taskId' | 'recordId' | 'source'>;
export type TaskRunnerKind = 'execute' | 'review';
type TaskRunnerKindUpdate = TaskRunnerKind | '';

export interface CreateTaskPayload {
  taskId: string;
  title: string;
  project: string;
  targetAgent: TargetAgent;
  priority: number;
  description?: string;
  /** Backend to create the task in. Defaults to the composite's default source. */
  source?: string;
}

/**
 * The runner/session bookkeeping a claim and a progress write carry — one shape,
 * so the providers' column mappings and the services' writes cannot drift.
 */
export interface RunnerSessionFields {
  workspacePath?: string;
  logPath?: string;
  progressSummary?: string;
  sessionId?: string;
  sessionName?: string;
  sessionHistory?: string;
  runnerPid?: number;
  runnerKind?: TaskRunnerKind;
  runnerAgent?: string;
  runnerRound?: number;
  lastHeartbeatAt?: string;
}

export interface ClaimTaskPayload extends RunnerSessionFields {
  claimedBy: string;
  claimedAt: string;
  runId: string;
}

export type UpdateTaskProgressPayload = Omit<RunnerSessionFields, 'progressSummary'> & {
  progressSummary: string;
};

export interface UpdateRunnerStatePayload {
  runnerPid?: number;
  runnerKind?: TaskRunnerKind;
  runnerAgent?: string;
  runnerRound?: number;
  lastHeartbeatAt?: string;
}

export interface UpdateTaskAssignmentPayload {
  targetAgent: TargetAgent;
  currentOwner?: string;
  progressSummary?: string;
  lastError?: string;
  workspacePath?: string;
}

export interface MarkTaskSucceededPayload {
  resultSummary: string;
  workspacePath?: string;
  logPath?: string;
  progressSummary?: string;
  sessionId?: string;
  sessionName?: string;
  prLink?: string;
  sessionHistory?: string;
}

export interface MarkTaskFailedPayload {
  lastError: string;
  workspacePath?: string;
  logPath?: string;
  progressSummary?: string;
  sessionId?: string;
  sessionName?: string;
  sessionHistory?: string;
}

/** The review/session bookkeeping a review-state write carries, as the record spells it. */
type ReviewSessionFields = Pick<
  TaskRecord,
  | 'executionSessionId'
  | 'executionSessionName'
  | 'reviewSessionId'
  | 'reviewSessionName'
  | 'reviewLogPath'
  | 'sessionHistory'
>;

export interface UpdateReviewStatePayload extends ReviewSessionFields {
  status: TaskStatus;
  currentOwner?: string;
  reviewRound?: number;
  reviewVerdict?: ReviewVerdict;
  reviewFindings?: string;
  acceptanceRound?: number;
  acceptanceVerdict?: AcceptanceVerdict;
  acceptanceFeedback?: string;
  progressSummary?: string;
  resultSummary?: string;
  workspacePath?: string;
  logPath?: string;
  lastError?: string;
  runnerPid?: number;
  runnerKind?: TaskRunnerKindUpdate;
  runnerAgent?: string;
  runnerRound?: number;
  lastHeartbeatAt?: string;
}

export interface UpdatePublishResultPayload {
  prLink?: string;
  publishBranch?: string;
  publishCommit?: string;
  publishedAt?: string;
  progressSummary?: string;
  resultSummary?: string;
  sessionHistory?: string;
  lastError?: string;
}

export interface UpdateCleanupStatePayload {
  progressSummary: string;
  currentOwner?: string;
}

export interface TaskProvider {
  listTasks(): Promise<TaskRecord[]>;
  listPendingTasks(agent: TargetAgent): Promise<TaskRecord[]>;
  getTaskById(taskId: string): Promise<TaskRecord | undefined>;
  createTask(payload: CreateTaskPayload): Promise<void>;
  claimTask(task: TaskRef, payload: ClaimTaskPayload): Promise<void>;
  updateTaskProgress(task: TaskRef, payload: UpdateTaskProgressPayload): Promise<void>;
  updateRunnerState(task: TaskRef, payload: UpdateRunnerStatePayload): Promise<void>;
  updateTaskAssignment(task: TaskRef, payload: UpdateTaskAssignmentPayload): Promise<void>;
  markTaskSucceeded(task: TaskRef, payload: MarkTaskSucceededPayload): Promise<void>;
  markTaskFailed(task: TaskRef, payload: MarkTaskFailedPayload): Promise<void>;
  updateReviewState(task: TaskRef, payload: UpdateReviewStatePayload): Promise<void>;
  updatePublishResult(task: TaskRef, payload: UpdatePublishResultPayload): Promise<void>;
  updateCleanupState(task: TaskRef, payload: UpdateCleanupStatePayload): Promise<void>;
}

/**
 * The list-based reads every leaf provider answers the same way: filter the
 * full list for the agent's pending tasks, and find one task by id.
 */
export function pendingTasksFrom(
  listTasks: () => Promise<TaskRecord[]>,
  agent: TargetAgent,
): Promise<TaskRecord[]> {
  return listTasks().then((tasks) => tasks.filter((task) => task.targetAgent === agent && task.status === '待处理'));
}

export function taskByIdFrom(
  listTasks: () => Promise<TaskRecord[]>,
  taskId: string,
): Promise<TaskRecord | undefined> {
  return listTasks().then((tasks) => tasks.find((task) => task.taskId === taskId));
}

/**
 * A leaf provider that owns exactly one backend (Feishu, GitHub Issues, …).
 * It stamps `source` on every record it returns; a multi-source aggregator
 * (see CompositeTaskProvider) uses that id to route writes back to the owner.
 */
export interface SourceProvider extends TaskProvider {
  readonly source: string;
}
