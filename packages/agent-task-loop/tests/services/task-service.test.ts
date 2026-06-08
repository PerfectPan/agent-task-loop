import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickNextTask } from '../../src/utils/priority';
import type { TaskRecord } from '../../src/types/task';
import { TaskService } from '../../src/services/task-service';
import { FeishuTaskProvider } from '../../src/task-management/feishu-task-provider';
import type { AppConfig } from '../../src/config/schema';

vi.mock('../../src/services/lark-cli', () => ({
  runLarkCli: vi.fn(),
}));

const config = {
  feishu: { baseToken: 'base', tableId: 'table' },
  projects: {},
  repositories: {},
  agents: {},
} as unknown as AppConfig;

describe('pickNextTask', () => {
  it('picks highest priority then oldest task', () => {
    const tasks: TaskRecord[] = [
      {
        taskId: 'T2',
        title: 'B',
        description: '',
        project: 'demo',
        targetAgent: 'codex',
        priority: 2,
        status: '待处理',
        createdAt: '2026-04-11T10:10:00Z',
      },
      {
        taskId: 'T1',
        title: 'A',
        description: '',
        project: 'demo',
        targetAgent: 'codex',
        priority: 3,
        status: '待处理',
        createdAt: '2026-04-11T10:20:00Z',
      },
      {
        taskId: 'T0',
        title: 'C',
        description: '',
        project: 'demo',
        targetAgent: 'codex',
        priority: 3,
        status: '待处理',
        createdAt: '2026-04-11T10:00:00Z',
      },
    ];

    expect(pickNextTask(tasks)?.taskId).toBe('T0');
  });
});

describe('TaskService', () => {
  beforeEach(async () => {
    const mod = await import('../../src/services/lark-cli');
    vi.mocked(mod.runLarkCli).mockResolvedValue(
      JSON.stringify({
        data: {
          fields: ['TaskID', 'Title', 'Description', 'Project', 'TargetAgent', 'Priority', 'Status', 'CreatedAt', 'LogPath', 'ProgressSummary', 'SessionId', 'SessionName', 'SessionHistory'],
          record_id_list: ['rec-1', 'rec-2'],
          data: [
            ['T-1', 'Fix', 'desc', 'demo', ['codex'], 5, ['待处理'], '2026-04-11T10:00:00Z', '/tmp/T-1.log', '正在准备工作区', 'sess-1', 'task-1-codex', '[2026-04-11T10:00:00Z] | round=1 | kind=execute'],
            ['T-2', 'Skip', 'desc', 'demo', ['claude'], 9, ['待处理'], '2026-04-11T09:00:00Z', '/tmp/T-2.log', '正在分析问题', 'sess-2', 'task-2-claude', '[2026-04-11T09:00:00Z] | round=1 | kind=execute'],
          ],
        },
      }),
    );
  });

  it('returns only pending tasks for one agent', async () => {
    const service = new TaskService(config);
    const tasks = await service.listPendingTasks('codex');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.recordId).toBe('rec-1');
    expect(tasks[0]?.taskId).toBe('T-1');
    expect(tasks[0]?.logPath).toBe('/tmp/T-1.log');
    expect(tasks[0]?.progressSummary).toBe('正在准备工作区');
    expect(tasks[0]?.sessionId).toBe('sess-1');
    expect(tasks[0]?.sessionName).toBe('task-1-codex');
    expect(tasks[0]?.sessionHistory).toContain('kind=execute');
  });

  it('returns one task by task id regardless of status', async () => {
    const service = new TaskService(config);
    const task = await service.getTaskById('T-2');
    expect(task?.recordId).toBe('rec-2');
    expect(task?.targetAgent).toBe('claude');
    expect(task?.logPath).toBe('/tmp/T-2.log');
    expect(task?.progressSummary).toBe('正在分析问题');
    expect(task?.sessionId).toBe('sess-2');
    expect(task?.sessionName).toBe('task-2-claude');
    expect(task?.sessionHistory).toContain('kind=execute');
  });

  it('deduplicates same TaskID rows and keeps the most complete record', async () => {
    const mod = await import('../../src/services/lark-cli');
    vi.mocked(mod.runLarkCli).mockResolvedValueOnce(
      JSON.stringify({
        data: {
          fields: ['TaskID', 'Title', 'Description', 'Project', 'TargetAgent', 'Priority', 'Status', 'WorkspacePath', 'ResultSummary'],
          record_id_list: ['rec-main', 'rec-empty'],
          data: [
            ['TASK-102', '切换租户登出问题', 'desc', 'demo', ['claude'], 10, ['待验收'], '/tmp/workspace', 'done'],
            ['TASK-102', '', '', '', ['claude'], 0, ['待处理'], '', ''],
          ],
        },
      }),
    );

    const service = new TaskService(config);
    const tasks = await service.listTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual(
      expect.objectContaining({
        recordId: 'rec-main',
        taskId: 'TASK-102',
        title: '切换租户登出问题',
        status: '待验收',
      }),
    );
  });

  it('prefers the freshest row when duplicate TaskID rows disagree', async () => {
    const mod = await import('../../src/services/lark-cli');
    vi.mocked(mod.runLarkCli).mockResolvedValueOnce(
      JSON.stringify({
        data: {
          fields: ['TaskID', 'Title', 'Description', 'Project', 'TargetAgent', 'Priority', 'Status', 'UpdatedAt', 'ProgressSummary'],
          record_id_list: ['rec-old', 'rec-new'],
          data: [
            ['TASK-200', '旧主卡', 'desc', 'demo', ['codex'], 10, ['待复核'], '2026-04-20T09:00:00Z', '旧进度'],
            ['TASK-200', '新主卡', 'desc', 'demo', ['codex'], 10, ['执行中'], '2026-04-20T10:00:00Z', '新进度'],
          ],
        },
      }),
    );

    const service = new TaskService(config);
    const tasks = await service.listTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual(
      expect.objectContaining({
        recordId: 'rec-new',
        title: '新主卡',
        status: '执行中',
        progressSummary: '新进度',
      }),
    );
  });

  it('maps review loop and acceptance fields from lark records', async () => {
    const provider = new FeishuTaskProvider(config);
    const task = (provider as any).mapFields({
      TaskID: 'TASK-201',
      Title: 'review loop',
      Description: 'desc',
      Project: 'demo',
      TargetAgent: 'claude',
      Priority: 10,
      Status: '待复核',
      CurrentOwner: 'codex',
      ReviewRound: 2,
      ReviewVerdict: '驳回',
      ReviewFindings: '1. fix it',
      AcceptanceRound: 1,
      AcceptanceVerdict: '打回',
      AcceptanceFeedback: '单测无效',
      ExecutionSessionId: 'exec-1',
      ExecutionSessionName: 'task-201-claude',
      ReviewSessionId: 'review-2',
      ReviewSessionName: 'task-201-review-codex-r2',
      ReviewLogPath: '/tmp/review.log',
      SessionHistory: '[2026-04-11T10:00:00Z] | round=1 | kind=execute | agent=claude',
      RunnerPid: 12345,
      RunnerKind: 'review',
      RunnerAgent: 'codex',
      RunnerRound: 2,
      LastHeartbeatAt: '2026-04-20T12:00:00Z',
      PublishBranch: 'task/task-201-claude',
      PublishCommit: 'abc123',
      PublishedAt: '2026-04-16 10:00',
    });

    expect(task.source).toBe('feishu');
    expect(task.currentOwner).toBe('codex');
    expect(task.reviewRound).toBe(2);
    expect(task.reviewVerdict).toBe('驳回');
    expect(task.reviewFindings).toContain('fix it');
    expect(task.acceptanceRound).toBe(1);
    expect(task.acceptanceVerdict).toBe('打回');
    expect(task.acceptanceFeedback).toBe('单测无效');
    expect(task.executionSessionId).toBe('exec-1');
    expect(task.executionSessionName).toBe('task-201-claude');
    expect(task.reviewSessionId).toBe('review-2');
    expect(task.reviewSessionName).toBe('task-201-review-codex-r2');
    expect(task.reviewLogPath).toBe('/tmp/review.log');
    expect(task.sessionHistory).toContain('kind=execute');
    expect(task.runnerPid).toBe(12345);
    expect(task.runnerKind).toBe('review');
    expect(task.runnerAgent).toBe('codex');
    expect(task.runnerRound).toBe(2);
    expect(task.lastHeartbeatAt).toBe('2026-04-20T12:00:00Z');
    expect(task.publishBranch).toBe('task/task-201-claude');
    expect(task.publishCommit).toBe('abc123');
    expect(task.publishedAt).toBe('2026-04-16 10:00');
  });

  it('writes select fields as arrays when updating review state', async () => {
    const mod = await import('../../src/services/lark-cli');
    vi.mocked(mod.runLarkCli).mockResolvedValue('{}');
    vi.mocked(mod.runLarkCli).mockClear();

    const service = new TaskService(config);
    await service.updateReviewState(
      {
        taskId: 'TASK-203',
        recordId: 'rec-203',
      },
      {
        status: '待决策',
        reviewVerdict: '通过',
        acceptanceVerdict: '打回',
        progressSummary: '诊断已完成，等待董事长确定修复方向',
      },
    );

    const args = vi.mocked(mod.runLarkCli).mock.calls.at(-1)?.[0] ?? [];
    const jsonIndex = args.indexOf('--json');
    expect(jsonIndex).toBeGreaterThan(-1);
    const payload = JSON.parse(String(args[jsonIndex + 1]));

    expect(payload.Status).toEqual(['待决策']);
    expect(payload.ReviewVerdict).toEqual(['通过']);
    expect(payload.AcceptanceVerdict).toEqual(['打回']);
  });

  it('clears runner fields when task leaves running statuses', async () => {
    const mod = await import('../../src/services/lark-cli');
    vi.mocked(mod.runLarkCli).mockResolvedValue('{}');
    vi.mocked(mod.runLarkCli).mockClear();

    const service = new TaskService(config);
    await service.updateReviewState(
      {
        taskId: 'TASK-204',
        recordId: 'rec-204',
      },
      {
        status: '待验收',
        runnerPid: 12345,
        runnerKind: 'review',
        runnerAgent: 'codex',
        runnerRound: 2,
        lastHeartbeatAt: '2026-04-20T12:00:00Z',
        progressSummary: 'codex review 已通过，等待验收',
      },
    );

    const args = vi.mocked(mod.runLarkCli).mock.calls.at(-1)?.[0] ?? [];
    const jsonIndex = args.indexOf('--json');
    const payload = JSON.parse(String(args[jsonIndex + 1]));

    expect(payload.RunnerPid).toBeNull();
    expect(payload.RunnerKind).toBe('');
    expect(payload.RunnerAgent).toBe('');
    expect(payload.RunnerRound).toBeNull();
    expect(payload.LastHeartbeatAt).toBe('');
    expect(payload.UpdatedAt).toBeTruthy();
  });

  it('clears contradictory error and verdict fields during cleanup', async () => {
    const mod = await import('../../src/services/lark-cli');
    vi.mocked(mod.runLarkCli).mockResolvedValue('{}');
    vi.mocked(mod.runLarkCli).mockClear();

    const service = new TaskService(config);
    await service.updateCleanupState(
      {
        taskId: 'TASK-205',
        recordId: 'rec-205',
      },
      {
        currentOwner: '董事长',
        progressSummary: '已强制清理任务工作区',
      },
    );

    const args = vi.mocked(mod.runLarkCli).mock.calls.at(-1)?.[0] ?? [];
    const jsonIndex = args.indexOf('--json');
    const payload = JSON.parse(String(args[jsonIndex + 1]));

    expect(payload.LastError).toBe('');
    expect(payload.ReviewVerdict).toEqual([]);
    expect(payload.ReviewFindings).toBe('');
    expect(payload.AcceptanceVerdict).toEqual([]);
    expect(payload.AcceptanceFeedback).toBe('');
  });

  it('resolves canonical record id before runner-only updates', async () => {
    const mod = await import('../../src/services/lark-cli');
    vi.mocked(mod.runLarkCli)
      .mockResolvedValueOnce(
        JSON.stringify({
          data: {
            fields: ['TaskID', 'Title', 'Description', 'Project', 'TargetAgent', 'Priority', 'Status'],
            record_id_list: ['rec-main', 'rec-empty'],
            data: [
              ['TASK-102', '切换租户登出问题', 'desc', 'demo', ['claude'], 10, ['待验收']],
              ['TASK-102', '', '', '', ['claude'], 0, ['待处理']],
            ],
          },
        }),
      )
      .mockResolvedValueOnce('{}');

    const service = new TaskService(config);
    await service.updateRunnerState(
      {
        taskId: 'TASK-102',
      },
      {
        runnerPid: 12345,
        runnerKind: 'review',
      },
    );

    const args = vi.mocked(mod.runLarkCli).mock.calls.at(-1)?.[0] ?? [];
    expect(args).toContain('--record-id');
    expect(args).toContain('rec-main');
  });
});
