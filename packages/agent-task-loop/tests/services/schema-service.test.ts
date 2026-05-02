import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { TaskTableSchemaService } from '../../src/services/schema-service';

vi.mock('../../src/services/lark-cli', () => ({
  runLarkCli: vi.fn(),
}));

const config = {
  feishu: { baseToken: 'base', tableId: 'table' },
  projects: {},
  repositories: {},
  agents: {},
} as unknown as AppConfig;

describe('TaskTableSchemaService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects missing required task fields', async () => {
    const mod = await import('../../src/services/lark-cli');
    vi.mocked(mod.runLarkCli).mockResolvedValueOnce(
      JSON.stringify({
        data: {
          fields: [{ name: 'TaskID' }, { name: 'Title' }, { name: 'Description' }],
        },
      }),
    );

    const service = new TaskTableSchemaService(config);
    const result = await service.checkSchema();

    expect(result.existing).toEqual(['TaskID', 'Title', 'Description']);
    expect(result.missing).toContain('TargetAgent');
    expect(result.missing).toContain('Status');
  });

  it('creates only missing fields when apply is requested', async () => {
    const mod = await import('../../src/services/lark-cli');
    const existingFields = [
      'TaskID',
      'Description',
      'Project',
      'Repository',
      'TargetAgent',
      'Priority',
      'WorkspacePath',
      'ResultSummary',
      'PRLink',
      'LastError',
      'ClaimedBy',
      'ClaimedAt',
      'CreatedAt',
      'RunId',
      'UpdatedAt',
    ];
    vi.mocked(mod.runLarkCli)
      .mockResolvedValueOnce(
        JSON.stringify({
          data: {
            fields: existingFields.map(name => ({ name })),
          },
        }),
      )
      .mockResolvedValue('{}')
      .mockResolvedValue('{}');

    const service = new TaskTableSchemaService(config);
    const result = await service.applyMissingFields(existingFields);

    expect(result.created).toEqual([
      'Title',
      'Status',
      'LogPath',
      'ProgressSummary',
      'SessionId',
      'SessionName',
      'CurrentOwner',
      'ReviewRound',
      'ReviewVerdict',
      'ReviewFindings',
      'AcceptanceRound',
      'AcceptanceVerdict',
      'AcceptanceFeedback',
      'ExecutionSessionId',
      'ExecutionSessionName',
      'ReviewSessionId',
      'ReviewSessionName',
      'ReviewLogPath',
      'SessionHistory',
      'RunnerPid',
      'RunnerKind',
      'RunnerAgent',
      'RunnerRound',
      'LastHeartbeatAt',
      'PublishBranch',
      'PublishCommit',
      'PublishedAt',
    ]);
    expect(result.updated).toEqual(['TargetAgent']);
    expect(vi.mocked(mod.runLarkCli)).toHaveBeenCalledTimes(28);
  });

  it('updates existing select fields when required options are missing', async () => {
    const mod = await import('../../src/services/lark-cli');
    const allFields = serviceFieldNames();
    vi.mocked(mod.runLarkCli)
      .mockResolvedValueOnce(
        JSON.stringify({
          data: {
            fields: allFields.map(name =>
              name === 'Status' ?
                {
                  id: 'fld-status',
                  name: 'Status',
                  type: 'select',
                  options: [
                    { name: '待处理' },
                    { name: '执行中' },
                    { name: '待复核' },
                    { name: '修复中' },
                    { name: '待验收' },
                    { name: '已完成' },
                    { name: '已失败' },
                  ],
                }
              : name === 'TargetAgent' ?
                {
                  id: 'fld-target-agent',
                  name: 'TargetAgent',
                  type: 'select',
                  options: [
                    { name: 'claude' },
                    { name: 'codex' },
                    { name: 'coco' },
                    { name: 'glm' },
                  ],
                }
              : name === 'ReviewVerdict' ?
                {
                  id: 'fld-review-verdict',
                  name: 'ReviewVerdict',
                  type: 'select',
                  options: [{ name: '通过' }, { name: '驳回' }],
                }
              : name === 'AcceptanceVerdict' ?
                {
                  id: 'fld-acceptance-verdict',
                  name: 'AcceptanceVerdict',
                  type: 'select',
                  options: [{ name: '通过' }],
                }
              : { name },
            ),
          },
        }),
      )
      .mockResolvedValueOnce('{}')
      .mockResolvedValueOnce('{}');

    const service = new TaskTableSchemaService(config);
    const result = await service.applyMissingFields();

    expect(result.created).toEqual([]);
    expect(result.updated).toEqual(['Status', 'AcceptanceVerdict']);
  });

  it('includes review loop and acceptance fields in required schema', () => {
    const service = new TaskTableSchemaService(config);
    const names = service.getRequiredFields().map(field => field.name);

    expect(names).toContain('CurrentOwner');
    expect(names).toContain('ReviewRound');
    expect(names).toContain('ReviewVerdict');
    expect(names).toContain('ReviewFindings');
    expect(names).toContain('AcceptanceRound');
    expect(names).toContain('AcceptanceVerdict');
    expect(names).toContain('AcceptanceFeedback');
    expect(names).toContain('ExecutionSessionId');
    expect(names).toContain('ExecutionSessionName');
    expect(names).toContain('ReviewSessionId');
    expect(names).toContain('ReviewSessionName');
    expect(names).toContain('ReviewLogPath');
    expect(names).toContain('SessionHistory');
    expect(names).toContain('RunnerPid');
    expect(names).toContain('RunnerKind');
    expect(names).toContain('RunnerAgent');
    expect(names).toContain('RunnerRound');
    expect(names).toContain('LastHeartbeatAt');
    expect(names).toContain('PublishBranch');
    expect(names).toContain('PublishCommit');
    expect(names).toContain('PublishedAt');
  });
});

function serviceFieldNames(): string[] {
  return [
    'TaskID',
    'Title',
    'Description',
    'Project',
    'Repository',
    'TargetAgent',
    'Priority',
    'Status',
    'WorkspacePath',
    'LogPath',
    'ProgressSummary',
    'SessionId',
    'SessionName',
    'ResultSummary',
    'PRLink',
    'LastError',
    'ClaimedBy',
    'ClaimedAt',
    'CreatedAt',
    'RunId',
    'UpdatedAt',
    'CurrentOwner',
    'ReviewRound',
    'ReviewVerdict',
    'ReviewFindings',
    'AcceptanceRound',
    'AcceptanceVerdict',
    'AcceptanceFeedback',
    'ExecutionSessionId',
    'ExecutionSessionName',
    'ReviewSessionId',
    'ReviewSessionName',
    'ReviewLogPath',
    'SessionHistory',
    'RunnerPid',
    'RunnerKind',
    'RunnerAgent',
    'RunnerRound',
    'LastHeartbeatAt',
    'PublishBranch',
    'PublishCommit',
    'PublishedAt',
  ];
}
