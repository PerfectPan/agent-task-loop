export const TASK_STATUSES = ['待处理', '进行中', '执行中', '待复核', '修复中', '待决策', '待发布', '待验收', '已完成', '已失败'] as const;
export const TARGET_AGENTS = ['claude', 'codex', 'coco', 'glm'] as const;
export const REVIEW_VERDICTS = ['通过', '驳回'] as const;
export const ACCEPTANCE_VERDICTS = ['通过', '打回'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TargetAgent = (typeof TARGET_AGENTS)[number];
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];
export type AcceptanceVerdict = (typeof ACCEPTANCE_VERDICTS)[number];

export interface TaskRecord {
  /**
   * Id of the backend that owns this task (its system of record), e.g. `'feishu'`.
   * The TUI is an integration layer — it never owns tasks, so every record carries
   * the source it was read from. Writes are routed back to the owning source.
   */
  source?: string;
  recordId?: string;
  taskId: string;
  title: string;
  description: string;
  project: string;
  repository?: string;
  targetAgent: TargetAgent;
  priority: number;
  status: TaskStatus;
  workspacePath?: string;
  logPath?: string;
  progressSummary?: string;
  sessionId?: string;
  sessionName?: string;
  resultSummary?: string;
  prLink?: string;
  lastError?: string;
  claimedBy?: string;
  claimedAt?: string;
  createdAt?: string;
  runId?: string;
  updatedAt?: string;
  currentOwner?: string;
  reviewRound?: number;
  reviewVerdict?: ReviewVerdict;
  reviewFindings?: string;
  acceptanceRound?: number;
  acceptanceVerdict?: AcceptanceVerdict;
  acceptanceFeedback?: string;
  executionSessionId?: string;
  executionSessionName?: string;
  reviewSessionId?: string;
  reviewSessionName?: string;
  reviewLogPath?: string;
  sessionHistory?: string;
  runnerPid?: number;
  runnerKind?: 'execute' | 'review';
  runnerAgent?: string;
  runnerRound?: number;
  lastHeartbeatAt?: string;
  publishBranch?: string;
  publishCommit?: string;
  publishedAt?: string;
}
