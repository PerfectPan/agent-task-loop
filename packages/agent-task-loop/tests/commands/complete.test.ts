import { beforeEach, describe, expect, it, vi } from 'vitest';

const completeSpy = vi.fn();

vi.mock('../../src/config/load-config', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    feishu: { baseToken: 'base', tableId: 'table' },
    projects: {},
    repositories: {},
    agents: {
      claude: { command: 'claude', args: [], env: {} },
      codex: { command: 'codex', args: [], env: {} },
    },
  }),
}));

vi.mock('../../src/config/runtime-guard', () => ({
  assertFeishuRuntimeConfig: vi.fn(),
}));

vi.mock('../../src/services/task-service', () => ({
  TaskService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/services/publish-context-service', () => ({
  PublishContextService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/services/git-publish-service', () => ({
  GitPublishService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/services/github-pull-request-service', () => ({
  GitHubPullRequestService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/services/complete-service', () => ({
  CompleteService: vi.fn().mockImplementation(() => ({
    complete: completeSpy,
  })),
}));

describe('completeCommand', () => {
  beforeEach(() => {
    completeSpy.mockReset();
    completeSpy.mockResolvedValue({
      branch: 'task/task-101-claude',
      commit: 'abc123',
      pullRequestUrl: 'https://github.com/acme/demo/pull/12',
    });
  });

  it('prints publish result after completion', async () => {
    const { completeCommand } = await import('../../src/commands/complete');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await completeCommand.run?.({
      args: {
        task: 'TASK-101',
        config: 'task.config.ts',
      },
    } as never);

    expect(completeSpy).toHaveBeenCalledWith({ taskId: 'TASK-101' });
    expect(logSpy).toHaveBeenCalledWith('Status: 已完成');
    logSpy.mockRestore();
  });
});
