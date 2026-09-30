import type { AppConfig } from '../config/schema';
import type { AcceptanceVerdict, ReviewVerdict, TargetAgent, TaskRecord, TaskStatus } from '../types/task';
import { runLarkCli } from '../services/lark-cli';
import type {
  ClaimTaskPayload,
  CreateTaskPayload,
  MarkTaskFailedPayload,
  MarkTaskSucceededPayload,
  SourceProvider,
  TaskRef,
  UpdateCleanupStatePayload,
  UpdatePublishResultPayload,
  UpdateReviewStatePayload,
  UpdateRunnerStatePayload,
  UpdateTaskAssignmentPayload,
  UpdateTaskProgressPayload,
} from './task-provider';

interface LarkRecordListResponse {
  items?: Array<{
    recordId?: string;
    fields: Record<string, unknown>;
  }>;
  data?: {
    data?: unknown[][];
    fields?: string[];
    record_id_list?: string[];
  };
}

function normalizeCellValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }
    if (value.length === 1) {
      return value[0];
    }
  }

  return value;
}

function buildFieldsFromRow(fieldNames: string[], row: unknown[]): Record<string, unknown> {
  return fieldNames.reduce<Record<string, unknown>>((acc, fieldName, index) => {
    acc[fieldName] = normalizeCellValue(row[index]);
    return acc;
  }, {});
}

function buildRecords(response: LarkRecordListResponse): Array<{ recordId?: string; fields: Record<string, unknown> }> {
  if (response.items) {
    return response.items.map(item => ({
      recordId: item.recordId,
      fields: item.fields,
    }));
  }

  const rows = response.data?.data ?? [];
  const fieldNames = response.data?.fields ?? [];
  const recordIds = response.data?.record_id_list ?? [];

  return rows.map((row, index) => ({
    recordId: recordIds[index],
    fields: buildFieldsFromRow(fieldNames, row),
  }));
}

function taskRecordScore(task: TaskRecord): number {
  return [
    task.recordId ? 1 : 0,
    task.title ? 1 : 0,
    task.description ? 1 : 0,
    task.project ? 1 : 0,
    task.status !== '待处理' ? 1 : 0,
    task.workspacePath ? 1 : 0,
    task.progressSummary ? 1 : 0,
    task.resultSummary ? 1 : 0,
    task.sessionHistory ? 1 : 0,
    task.publishBranch ? 1 : 0,
    task.publishCommit ? 1 : 0,
    task.executionSessionId ? 1 : 0,
    task.reviewSessionId ? 1 : 0,
  ].reduce((total, item) => total + item, 0);
}

function parseTimestamp(value: string | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function taskRecordFreshness(task: TaskRecord): number {
  return Math.max(
    parseTimestamp(task.updatedAt),
    parseTimestamp(task.lastHeartbeatAt),
    parseTimestamp(task.publishedAt),
    parseTimestamp(task.claimedAt),
    parseTimestamp(task.createdAt),
  );
}

function pickCanonicalTask(tasks: TaskRecord[]): TaskRecord {
  return [...tasks].sort((left, right) => {
    const freshnessDelta = taskRecordFreshness(right) - taskRecordFreshness(left);
    if (freshnessDelta !== 0) {
      return freshnessDelta;
    }

    const scoreDelta = taskRecordScore(right) - taskRecordScore(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return (right.recordId ?? '').localeCompare(left.recordId ?? '');
  })[0]!;
}

const RUNNING_STATUSES = new Set<TaskStatus>(['执行中', '修复中', '待复核']);

function buildRecordPayload(
  taskId: string,
  payload: Record<string, unknown>,
  options: {
    touchUpdatedAt?: boolean;
  } = {},
): Record<string, unknown> {
  return {
    TaskID: taskId,
    ...(options.touchUpdatedAt === false ? {} : { UpdatedAt: new Date().toISOString() }),
    ...payload,
  };
}

export const FEISHU_SOURCE = 'feishu';

export class FeishuTaskProvider implements SourceProvider {
  readonly source = FEISHU_SOURCE;

  constructor(private readonly config: AppConfig) {
    if (!config.feishu) {
      throw new Error('FeishuTaskProvider requires a `feishu` config block');
    }
  }

  /** Narrowed accessor: this provider is only constructed when `feishu` is present. */
  private get feishu(): NonNullable<AppConfig['feishu']> {
    if (!this.config.feishu) {
      throw new Error('FeishuTaskProvider requires a `feishu` config block');
    }
    return this.config.feishu;
  }

  async listPendingTasks(agent: TargetAgent): Promise<TaskRecord[]> {
    return (await this.listTasks()).filter(task => task.targetAgent === agent && task.status === '待处理');
  }

  async getTaskById(taskId: string): Promise<TaskRecord | undefined> {
    return (await this.listTasks()).find(task => task.taskId === taskId);
  }

  async createTask(payload: CreateTaskPayload): Promise<void> {
    // No --record-id ⇒ record-upsert inserts a brand-new row.
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      '--json',
      JSON.stringify(
        buildRecordPayload(payload.taskId, {
          Title: payload.title,
          Project: payload.project,
          TargetAgent: [payload.targetAgent],
          Priority: payload.priority,
          Status: '待处理',
          Description: payload.description ?? '',
          CreatedAt: new Date().toISOString(),
        }),
      ),
    ]);
  }

  async listTasks(): Promise<TaskRecord[]> {
    const tasks = await this.listTaskRows();
    const grouped = new Map<string, TaskRecord[]>();
    for (const task of tasks) {
      const bucket = grouped.get(task.taskId) ?? [];
      bucket.push(task);
      grouped.set(task.taskId, bucket);
    }

    return Array.from(grouped.values()).map(tasksForSameId => pickCanonicalTask(tasksForSameId));
  }

  private async listTaskRows(): Promise<TaskRecord[]> {
    const stdout = await runLarkCli([
      'base',
      '+record-list',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      '--limit',
      '200',
      // lark-cli defaults to markdown output; we parse the raw JSON envelope.
      '--format',
      'json',
    ]);

    const data = JSON.parse(stdout) as LarkRecordListResponse;
    return buildRecords(data)
      .map(item => this.mapFields(item.fields, item.recordId))
      .filter(task => task.taskId.length > 0);
  }

  private async resolveRecordRef(task: TaskRef): Promise<TaskRef> {
    if (task.recordId) {
      return task;
    }

    const matches = (await this.listTaskRows()).filter(item => item.taskId === task.taskId);
    if (matches.length === 0) {
      return task;
    }

    const canonical = pickCanonicalTask(matches);
    return {
      taskId: canonical.taskId,
      recordId: canonical.recordId,
    };
  }

  async claimTask(
    task: TaskRef,
    payload: ClaimTaskPayload,
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      ...(taskRef.recordId ? ['--record-id', taskRef.recordId] : []),
      '--json',
      JSON.stringify(buildRecordPayload(task.taskId, {
        Status: '执行中',
        ClaimedBy: payload.claimedBy,
        ClaimedAt: payload.claimedAt,
        RunId: payload.runId,
        WorkspacePath: payload.workspacePath,
        LogPath: payload.logPath,
        ProgressSummary: payload.progressSummary,
        SessionId: payload.sessionId,
        SessionName: payload.sessionName,
        SessionHistory: payload.sessionHistory,
        RunnerPid: payload.runnerPid,
        RunnerKind: payload.runnerKind,
        RunnerAgent: payload.runnerAgent,
        RunnerRound: payload.runnerRound,
        LastHeartbeatAt: payload.lastHeartbeatAt,
        CurrentOwner: payload.claimedBy.split('@')[0],
        LastError: '',
      })),
    ]);
  }

  async updateTaskProgress(
    task: TaskRef,
    payload: UpdateTaskProgressPayload,
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      ...(taskRef.recordId ? ['--record-id', taskRef.recordId] : []),
      '--json',
      JSON.stringify(buildRecordPayload(task.taskId, {
        ProgressSummary: payload.progressSummary,
        WorkspacePath: payload.workspacePath,
        LogPath: payload.logPath,
        SessionId: payload.sessionId,
        SessionName: payload.sessionName,
        SessionHistory: payload.sessionHistory,
        RunnerPid: payload.runnerPid,
        RunnerKind: payload.runnerKind,
        RunnerAgent: payload.runnerAgent,
        RunnerRound: payload.runnerRound,
        LastHeartbeatAt: payload.lastHeartbeatAt,
      })),
    ]);
  }

  async updateRunnerState(
    task: TaskRef,
    payload: UpdateRunnerStatePayload,
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      ...(taskRef.recordId ? ['--record-id', taskRef.recordId] : []),
      '--json',
      JSON.stringify(buildRecordPayload(task.taskId, {
        RunnerPid: payload.runnerPid,
        RunnerKind: payload.runnerKind,
        RunnerAgent: payload.runnerAgent,
        RunnerRound: payload.runnerRound,
        LastHeartbeatAt: payload.lastHeartbeatAt,
      })),
    ]);
  }

  async updateTaskAssignment(
    task: TaskRef,
    payload: UpdateTaskAssignmentPayload,
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      ...(taskRef.recordId ? ['--record-id', taskRef.recordId] : []),
      '--json',
      JSON.stringify(buildRecordPayload(task.taskId, {
        TargetAgent: [payload.targetAgent],
        CurrentOwner: payload.currentOwner,
        ProgressSummary: payload.progressSummary,
        LastError: payload.lastError,
        WorkspacePath: payload.workspacePath,
      })),
    ]);
  }

  async markTaskSucceeded(
    task: TaskRef,
    payload: MarkTaskSucceededPayload,
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      ...(taskRef.recordId ? ['--record-id', taskRef.recordId] : []),
      '--json',
      JSON.stringify(buildRecordPayload(task.taskId, {
        Status: '待验收',
        ResultSummary: payload.resultSummary,
        WorkspacePath: payload.workspacePath,
        LogPath: payload.logPath,
        ProgressSummary: payload.progressSummary,
        SessionId: payload.sessionId,
        SessionName: payload.sessionName,
        SessionHistory: payload.sessionHistory,
        PRLink: payload.prLink,
        LastError: '',
      })),
    ]);
  }

  async markTaskFailed(
    task: TaskRef,
    payload: MarkTaskFailedPayload,
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      ...(taskRef.recordId ? ['--record-id', taskRef.recordId] : []),
      '--json',
      JSON.stringify(buildRecordPayload(task.taskId, {
        Status: '已失败',
        LastError: payload.lastError,
        WorkspacePath: payload.workspacePath,
        LogPath: payload.logPath,
        ProgressSummary: payload.progressSummary,
        SessionId: payload.sessionId,
        SessionName: payload.sessionName,
        SessionHistory: payload.sessionHistory,
      })),
    ]);
  }

  async updateReviewState(
    task: TaskRef,
    payload: UpdateReviewStatePayload,
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    const shouldClearRunner = !RUNNING_STATUSES.has(payload.status);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      ...(taskRef.recordId ? ['--record-id', taskRef.recordId] : []),
      '--json',
      JSON.stringify(buildRecordPayload(task.taskId, {
        Status: [payload.status],
        CurrentOwner: payload.currentOwner,
        ReviewRound: payload.reviewRound,
        ReviewVerdict: payload.reviewVerdict ? [payload.reviewVerdict] : undefined,
        ReviewFindings: payload.reviewFindings,
        AcceptanceRound: payload.acceptanceRound,
        AcceptanceVerdict: payload.acceptanceVerdict ? [payload.acceptanceVerdict] : undefined,
        AcceptanceFeedback: payload.acceptanceFeedback,
        ExecutionSessionId: payload.executionSessionId,
        ExecutionSessionName: payload.executionSessionName,
        ReviewSessionId: payload.reviewSessionId,
        ReviewSessionName: payload.reviewSessionName,
        ReviewLogPath: payload.reviewLogPath,
        SessionHistory: payload.sessionHistory,
        RunnerPid: shouldClearRunner ? null : payload.runnerPid,
        RunnerKind: shouldClearRunner ? '' : (payload.runnerKind ?? ''),
        RunnerAgent: shouldClearRunner ? '' : (payload.runnerAgent ?? ''),
        RunnerRound: shouldClearRunner ? null : payload.runnerRound,
        LastHeartbeatAt: shouldClearRunner ? '' : payload.lastHeartbeatAt,
        ProgressSummary: payload.progressSummary,
        ResultSummary: payload.resultSummary,
        WorkspacePath: payload.workspacePath,
        LogPath: payload.logPath,
        LastError: payload.lastError,
      })),
    ]);
  }

  async updatePublishResult(
    task: TaskRef,
    payload: UpdatePublishResultPayload,
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      ...(taskRef.recordId ? ['--record-id', taskRef.recordId] : []),
      '--json',
      JSON.stringify(buildRecordPayload(task.taskId, {
        PRLink: payload.prLink,
        PublishBranch: payload.publishBranch,
        PublishCommit: payload.publishCommit,
        PublishedAt: payload.publishedAt,
        ProgressSummary: payload.progressSummary,
        ResultSummary: payload.resultSummary,
        SessionHistory: payload.sessionHistory,
        LastError: payload.lastError,
      })),
    ]);
  }

  async updateCleanupState(
    task: TaskRef,
    payload: UpdateCleanupStatePayload,
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.feishu.baseToken,
      '--table-id',
      this.feishu.tableId,
      ...(taskRef.recordId ? ['--record-id', taskRef.recordId] : []),
      '--json',
      JSON.stringify(
        buildRecordPayload(
          task.taskId,
          {
            CurrentOwner: payload.currentOwner,
            ProgressSummary: payload.progressSummary,
            WorkspacePath: '',
            LogPath: '',
            ReviewLogPath: '',
            RunnerPid: null,
            RunnerKind: '',
            RunnerAgent: '',
            RunnerRound: null,
            LastHeartbeatAt: '',
            LastError: '',
            ReviewVerdict: [],
            ReviewFindings: '',
            AcceptanceVerdict: [],
            AcceptanceFeedback: '',
          },
          {
            touchUpdatedAt: true,
          },
        ),
      ),
    ]);
  }

  private mapFields(fields: Record<string, unknown>, recordId?: string): TaskRecord {
    return {
      source: this.source,
      recordId,
      taskId: cellText(fields.TaskID ?? ''),
      title: cellText(fields.Title ?? ''),
      description: cellText(fields.Description ?? ''),
      project: cellText(fields.Project ?? ''),
      repository: optionalCellText(fields.Repository),
      targetAgent: cellText(fields.TargetAgent ?? 'codex') as TargetAgent,
      priority: Number(fields.Priority ?? 0),
      status: cellText(fields.Status ?? '待处理') as TaskStatus,
      workspacePath: optionalCellText(fields.WorkspacePath),
      logPath: optionalCellText(fields.LogPath),
      progressSummary: optionalCellText(fields.ProgressSummary),
      sessionId: optionalCellText(fields.SessionId),
      sessionName: optionalCellText(fields.SessionName),
      resultSummary: optionalCellText(fields.ResultSummary),
      prLink: optionalCellText(fields.PRLink),
      lastError: optionalCellText(fields.LastError),
      claimedBy: optionalCellText(fields.ClaimedBy),
      claimedAt: optionalCellText(fields.ClaimedAt),
      createdAt: optionalCellText(fields.CreatedAt),
      runId: optionalCellText(fields.RunId),
      updatedAt: optionalCellText(fields.UpdatedAt),
      currentOwner: optionalCellText(fields.CurrentOwner),
      reviewRound: fields.ReviewRound !== undefined && fields.ReviewRound !== null ? Number(fields.ReviewRound) : undefined,
      reviewVerdict: (optionalCellText(fields.ReviewVerdict) as ReviewVerdict | undefined),
      reviewFindings: optionalCellText(fields.ReviewFindings),
      acceptanceRound:
        fields.AcceptanceRound !== undefined && fields.AcceptanceRound !== null ? Number(fields.AcceptanceRound) : undefined,
      acceptanceVerdict: (optionalCellText(fields.AcceptanceVerdict) as AcceptanceVerdict | undefined),
      acceptanceFeedback: optionalCellText(fields.AcceptanceFeedback),
      executionSessionId: optionalCellText(fields.ExecutionSessionId),
      executionSessionName: optionalCellText(fields.ExecutionSessionName),
      reviewSessionId: optionalCellText(fields.ReviewSessionId),
      reviewSessionName: optionalCellText(fields.ReviewSessionName),
      reviewLogPath: optionalCellText(fields.ReviewLogPath),
      sessionHistory: optionalCellText(fields.SessionHistory),
      runnerPid: fields.RunnerPid !== undefined && fields.RunnerPid !== null ? Number(fields.RunnerPid) : undefined,
      runnerKind:
        optionalCellText(fields.RunnerKind)?.trim() ?
          (cellText(fields.RunnerKind) as 'execute' | 'review')
        : undefined,
      runnerAgent: optionalCellText(fields.RunnerAgent),
      runnerRound: fields.RunnerRound !== undefined && fields.RunnerRound !== null ? Number(fields.RunnerRound) : undefined,
      lastHeartbeatAt: optionalCellText(fields.LastHeartbeatAt),
      publishBranch: optionalCellText(fields.PublishBranch),
      publishCommit: optionalCellText(fields.PublishCommit),
      publishedAt: optionalCellText(fields.PublishedAt),
    };
  }
}

// Feishu returns these cells as text or numbers. Any other shape is kept as
// JSON so it stays readable instead of becoming "[object Object]".
function cellText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

function optionalCellText(value: unknown): string | undefined {
  return value ? cellText(value) : undefined;
}
