import { describe, expect, it, vi } from 'vitest';

const { runLarkCli } = vi.hoisted(() => ({ runLarkCli: vi.fn().mockResolvedValue('{}') }));
vi.mock('../../src/services/lark-cli', () => ({ runLarkCli }));

import { FeishuTaskProvider } from '../../src/task-management/feishu-task-provider';
import type { AppConfig } from '../../src/config/schema';

const config = {
  feishu: { baseToken: 'bascnXXXX', tableId: 'tblXXXX' },
  projects: {},
  repositories: {},
  agents: {},
} as unknown as AppConfig;

describe('FeishuTaskProvider.createTask', () => {
  it('inserts a new record (no --record-id) with the task fields', async () => {
    runLarkCli.mockClear();
    const provider = new FeishuTaskProvider(config);

    await provider.createTask({
      taskId: 'IDEA-300',
      title: 'New feature',
      project: 'miaoda',
      targetAgent: 'codex',
      priority: 2,
      description: 'do the thing',
    });

    expect(runLarkCli).toHaveBeenCalledTimes(1);
    const args: string[] = runLarkCli.mock.calls[0][0];
    expect(args).toContain('+record-upsert');
    expect(args).not.toContain('--record-id'); // absence ⇒ create
    const payload = JSON.parse(args[args.indexOf('--json') + 1]);
    expect(payload).toMatchObject({
      TaskID: 'IDEA-300',
      Title: 'New feature',
      Project: 'miaoda',
      TargetAgent: ['codex'],
      Priority: 2,
      Status: '待处理',
      Description: 'do the thing',
    });
  });
});
