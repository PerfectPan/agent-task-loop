import type { AppConfig } from '../config/schema';
import type { AcceptanceVerdict, ReviewVerdict, TargetAgent, TaskRecord, TaskStatus } from '../types/task';
import { runLarkCli } from './lark-cli';

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

export class TaskService {
  constructor(private readonly config: AppConfig) {}

  async listPendingTasks(agent: TargetAgent): Promise<TaskRecord[]> {
    return (await this.listTasks()).filter(task => task.targetAgent === agent && task.status === '待处理');
  }

  async getTaskById(taskId: string): Promise<TaskRecord | undefined> {
    return (await this.listTasks()).find(task => task.taskId === taskId);
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
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
      '--limit',
      '200',
    ]);

    const data = JSON.parse(stdout) as LarkRecordListResponse;
    return buildRecords(data)
      .map(item => this.mapFields(item.fields, item.recordId))
      .filter(task => task.taskId.length > 0);
  }

  private async resolveRecordRef(task: Pick<TaskRecord, 'taskId' | 'recordId'>): Promise<Pick<TaskRecord, 'taskId' | 'recordId'>> {
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
    task: Pick<TaskRecord, 'taskId' | 'recordId'>,
    payload: {
      claimedBy: string;
      claimedAt: string;
      runId: string;
      workspacePath?: string;
      logPath?: string;
      progressSummary?: string;
      sessionId?: string;
      sessionName?: string;
      sessionHistory?: string;
      runnerPid?: number;
      runnerKind?: 'execute' | 'review';
      runnerAgent?: string;
      runnerRound?: number;
      lastHeartbeatAt?: string;
    },
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
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
    task: Pick<TaskRecord, 'taskId' | 'recordId'>,
    payload: {
      progressSummary: string;
      workspacePath?: string;
      logPath?: string;
      sessionId?: string;
      sessionName?: string;
      sessionHistory?: string;
      runnerPid?: number;
      runnerKind?: 'execute' | 'review';
      runnerAgent?: string;
      runnerRound?: number;
      lastHeartbeatAt?: string;
    },
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
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
    task: Pick<TaskRecord, 'taskId' | 'recordId'>,
    payload: {
      runnerPid?: number;
      runnerKind?: 'execute' | 'review';
      runnerAgent?: string;
      runnerRound?: number;
      lastHeartbeatAt?: string;
    },
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
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
    task: Pick<TaskRecord, 'taskId' | 'recordId'>,
    payload: {
      targetAgent: TargetAgent;
      currentOwner?: string;
      progressSummary?: string;
      lastError?: string;
      workspacePath?: string;
    },
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
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
    task: Pick<TaskRecord, 'taskId' | 'recordId'>,
    payload: {
      resultSummary: string;
      workspacePath?: string;
      logPath?: string;
      progressSummary?: string;
      sessionId?: string;
      sessionName?: string;
      prLink?: string;
      sessionHistory?: string;
    },
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
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
    task: Pick<TaskRecord, 'taskId' | 'recordId'>,
    payload: {
      lastError: string;
      workspacePath?: string;
      logPath?: string;
      progressSummary?: string;
      sessionId?: string;
      sessionName?: string;
      sessionHistory?: string;
    },
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
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
    task: Pick<TaskRecord, 'taskId' | 'recordId'>,
    payload: {
      status: TaskStatus;
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
      progressSummary?: string;
      resultSummary?: string;
      workspacePath?: string;
      logPath?: string;
      lastError?: string;
      runnerPid?: number;
      runnerKind?: 'execute' | 'review';
      runnerAgent?: string;
      runnerRound?: number;
      lastHeartbeatAt?: string;
    },
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    const shouldClearRunner = !RUNNING_STATUSES.has(payload.status);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
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
    task: Pick<TaskRecord, 'taskId' | 'recordId'>,
    payload: {
      prLink?: string;
      publishBranch?: string;
      publishCommit?: string;
      publishedAt?: string;
      progressSummary?: string;
      resultSummary?: string;
      sessionHistory?: string;
      lastError?: string;
    },
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
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
    task: Pick<TaskRecord, 'taskId' | 'recordId'>,
    payload: {
      progressSummary: string;
      currentOwner?: string;
    },
  ): Promise<void> {
    const taskRef = await this.resolveRecordRef(task);
    await runLarkCli([
      'base',
      '+record-upsert',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
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
      recordId,
      taskId: String(fields.TaskID ?? ''),
      title: String(fields.Title ?? ''),
      description: String(fields.Description ?? ''),
      project: String(fields.Project ?? ''),
      repository: fields.Repository ? String(fields.Repository) : undefined,
      targetAgent: String(fields.TargetAgent ?? 'codex') as TargetAgent,
      priority: Number(fields.Priority ?? 0),
      status: String(fields.Status ?? '待处理') as TaskStatus,
      workspacePath: fields.WorkspacePath ? String(fields.WorkspacePath) : undefined,
      logPath: fields.LogPath ? String(fields.LogPath) : undefined,
      progressSummary: fields.ProgressSummary ? String(fields.ProgressSummary) : undefined,
      sessionId: fields.SessionId ? String(fields.SessionId) : undefined,
      sessionName: fields.SessionName ? String(fields.SessionName) : undefined,
      resultSummary: fields.ResultSummary ? String(fields.ResultSummary) : undefined,
      prLink: fields.PRLink ? String(fields.PRLink) : undefined,
      lastError: fields.LastError ? String(fields.LastError) : undefined,
      claimedBy: fields.ClaimedBy ? String(fields.ClaimedBy) : undefined,
      claimedAt: fields.ClaimedAt ? String(fields.ClaimedAt) : undefined,
      createdAt: fields.CreatedAt ? String(fields.CreatedAt) : undefined,
      runId: fields.RunId ? String(fields.RunId) : undefined,
      updatedAt: fields.UpdatedAt ? String(fields.UpdatedAt) : undefined,
      currentOwner: fields.CurrentOwner ? String(fields.CurrentOwner) : undefined,
      reviewRound: fields.ReviewRound !== undefined && fields.ReviewRound !== null ? Number(fields.ReviewRound) : undefined,
      reviewVerdict: fields.ReviewVerdict ? (String(fields.ReviewVerdict) as ReviewVerdict) : undefined,
      reviewFindings: fields.ReviewFindings ? String(fields.ReviewFindings) : undefined,
      acceptanceRound:
        fields.AcceptanceRound !== undefined && fields.AcceptanceRound !== null ? Number(fields.AcceptanceRound) : undefined,
      acceptanceVerdict: fields.AcceptanceVerdict ? (String(fields.AcceptanceVerdict) as AcceptanceVerdict) : undefined,
      acceptanceFeedback: fields.AcceptanceFeedback ? String(fields.AcceptanceFeedback) : undefined,
      executionSessionId: fields.ExecutionSessionId ? String(fields.ExecutionSessionId) : undefined,
      executionSessionName: fields.ExecutionSessionName ? String(fields.ExecutionSessionName) : undefined,
      reviewSessionId: fields.ReviewSessionId ? String(fields.ReviewSessionId) : undefined,
      reviewSessionName: fields.ReviewSessionName ? String(fields.ReviewSessionName) : undefined,
      reviewLogPath: fields.ReviewLogPath ? String(fields.ReviewLogPath) : undefined,
      sessionHistory: fields.SessionHistory ? String(fields.SessionHistory) : undefined,
      runnerPid: fields.RunnerPid !== undefined && fields.RunnerPid !== null ? Number(fields.RunnerPid) : undefined,
      runnerKind:
        fields.RunnerKind && String(fields.RunnerKind).trim() ?
          (String(fields.RunnerKind) as 'execute' | 'review')
        : undefined,
      runnerAgent: fields.RunnerAgent ? String(fields.RunnerAgent) : undefined,
      runnerRound: fields.RunnerRound !== undefined && fields.RunnerRound !== null ? Number(fields.RunnerRound) : undefined,
      lastHeartbeatAt: fields.LastHeartbeatAt ? String(fields.LastHeartbeatAt) : undefined,
      publishBranch: fields.PublishBranch ? String(fields.PublishBranch) : undefined,
      publishCommit: fields.PublishCommit ? String(fields.PublishCommit) : undefined,
      publishedAt: fields.PublishedAt ? String(fields.PublishedAt) : undefined,
    };
  }
}
