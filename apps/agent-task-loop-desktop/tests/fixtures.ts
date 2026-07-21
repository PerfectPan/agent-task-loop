import type {
  BackgroundStartResult,
  ListTasksInput,
  PublicTaskDto,
  RunPhase,
  TaskListResult,
  TaskManagerApplication,
  TaskMutationResult,
  TaskStartResult,
} from '@rivus/agent-task-loop/task-manager';
import { RunPhaseRegistry, toPublicTask } from '@rivus/agent-task-loop/task-manager';
import type { BackgroundStartService } from '@rivus/agent-task-loop/task-manager';
import type { CreateTaskPayload, GetTaskInput, StartTaskInput } from '@rivus/agent-task-loop/task-manager';
import type { TaskRecord } from '@rivus/agent-task-loop/task-manager';

/**
 * Adversarial TaskRecord with every denied field populated.
 * Tests must assert none of these appear in JSON or SSE responses.
 */
export function adversarialTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'TASK-SECRET',
    title: 'Secret task',
    description: 'Do not leak internal details',
    project: 'internal-project',
    repository: 'private/monorepo',
    source: 'github:private/monorepo',
    targetAgent: 'codex',
    priority: 5,
    status: '执行中',
    // Denied fields below — must never appear in responses:
    workspacePath: '/Users/bytedance/.agent-task-loop/workspaces/TASK-SECRET',
    logPath: '/Users/bytedance/.agent-task-loop/logs/TASK-SECRET.log',
    sessionId: 'session-abc123',
    sessionName: 'machine-session-name',
    sessionHistory: 'raw transcript with secrets',
    runId: 'run-private-id',
    runnerPid: 54321,
    runnerKind: 'execute',
    runnerAgent: 'codex',
    runnerRound: 2,
    lastHeartbeatAt: '2026-07-21T00:00:00.000Z',
    claimedBy: 'operator@internal-domain.example',
    claimedAt: '2026-07-21T00:00:00.000Z',
    lastError: 'failed with token: ghp_SECRETTOKEN123 and path /Users/bytedance/.ssh',
    publishBranch: 'feat/private-branch',
    publishCommit: 'deadbeef1234567890abcdef',
    publishedAt: '2026-07-21T00:00:00.000Z',
    reviewLogPath: '/Users/bytedance/.agent-task-loop/logs/TASK-SECRET-review.log',
    executionSessionId: 'exec-session-secret',
    executionSessionName: 'exec-session-name',
    reviewSessionId: 'review-session-secret',
    reviewSessionName: 'review-session-name',
    progressSummary: 'In progress',
    resultSummary: 'Done',
    prLink: 'https://github.com/private/monorepo/pull/1',
    currentOwner: 'codex',
    reviewRound: 1,
    reviewVerdict: '通过',
    reviewFindings: 'minor: needs cleanup at /Users/bytedance/tmp',
    acceptanceRound: 0,
    acceptanceVerdict: undefined,
    acceptanceFeedback: undefined,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:05:00.000Z',
    ...overrides,
  };
}

/**
 * The set of fields that MUST never appear in a public response.
 */
export const DENIED_FIELDS: ReadonlySet<string> = new Set([
  'workspacePath',
  'logPath',
  'sessionId',
  'sessionName',
  'sessionHistory',
  'runId',
  'runnerPid',
  'runnerKind',
  'runnerAgent',
  'runnerRound',
  'lastHeartbeatAt',
  'claimedBy',
  'claimedAt',
  'lastError',
  'publishBranch',
  'publishCommit',
  'publishedAt',
  'reviewLogPath',
  'executionSessionId',
  'executionSessionName',
  'reviewSessionId',
  'reviewSessionName',
  'reviewFindings',
  'acceptanceFeedback',
]);

export function fakeTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'TASK-001',
    title: 'Sample task',
    description: 'A sample task for testing',
    project: 'test-project',
    targetAgent: 'claude',
    priority: 3,
    status: '待处理',
    ...overrides,
  };
}

export interface FakeApplicationOptions {
  tasks?: TaskRecord[];
  startDelayMs?: number;
  startResult?: TaskRecord;
}

export function createFakeApplication(options: FakeApplicationOptions = {}): TaskManagerApplication {
  const tasks = options.tasks ?? [fakeTaskRecord()];
  const startDelayMs = options.startDelayMs ?? 0;
  const startResult = options.startResult;

  return {
    async listTasks(input: ListTasksInput): Promise<TaskListResult> {
      const matching = tasks.filter(
        t =>
          (!input.status || t.status === input.status) &&
          (!input.targetAgent || t.targetAgent === input.targetAgent),
      );
      const visible = matching.slice(0, input.limit).map(toPublicTask);
      return { count: visible.length, tasks: visible, truncated: matching.length > visible.length };
    },
    async getTask(input: GetTaskInput) {
      const task = tasks.find(t => t.taskId === input.taskId);
      if (!task) {
        const { TaskManagerInputError } = await import('@rivus/agent-task-loop/task-manager');
        throw new TaskManagerInputError('task-not-found', `Task ${input.taskId} not found`);
      }
      return { task: toPublicTask(task) };
    },
    async createTask(input: CreateTaskPayload): Promise<TaskMutationResult> {
      tasks.push(fakeTaskRecord({ ...input }));
      return { action: 'created', taskId: input.taskId };
    },
    async startTask(input: StartTaskInput): Promise<TaskStartResult> {
      if (startDelayMs > 0) {
        await new Promise(r => setTimeout(r, startDelayMs));
      }
      const task = startResult ?? tasks.find(t => t.taskId === input.taskId) ?? fakeTaskRecord({ taskId: input.taskId });
      return { action: 'review-loop-completed', task: toPublicTask(task), taskId: input.taskId };
    },
  };
}

export interface FakeBackgroundStartOptions {
  /** If true, throws task-already-active. */
  alreadyActive?: boolean;
  /** Delay before the background loop completes (ms). */
  loopDelayMs?: number;
  /** Override the returned run phase. */
  runPhase?: RunPhase;
}

export function createFakeBackgroundStart(
  options: FakeBackgroundStartOptions = {},
): BackgroundStartService {
  const registry = new RunPhaseRegistry();

  return {
    registry,
    async startTaskBackground(input: StartTaskInput): Promise<BackgroundStartResult> {
      if (options.alreadyActive) {
        const { TaskManagerInputError } = await import('@rivus/agent-task-loop/task-manager');
        throw new TaskManagerInputError('task-already-active', `Task ${input.taskId} already has an active runner`);
      }
      const runPhase: RunPhase = options.runPhase ?? 'running';
      registry.set(input.taskId, runPhase);

      // Simulate background loop completion after delay.
      if (options.loopDelayMs) {
        setTimeout(() => {
          registry.set(input.taskId, 'idle');
        }, options.loopDelayMs);
      }

      const task = toPublicTask(fakeTaskRecord({ taskId: input.taskId }));
      return { action: 'started', task, taskId: input.taskId, runPhase };
    },
  } as unknown as BackgroundStartService;
}
