import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/load-config', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    feishu: { baseToken: 'base', tableId: 'table' },
    projects: { demo: {} },
    repositories: { demo_repo: {}, docs_repo: {} },
    agents: { claude: {}, codex: {}, coco: {} },
  }),
}));

describe('syncCommand', () => {
  it('prints config counts as json when requested', async () => {
    const { syncCommand } = await import('../../src/commands/sync');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await syncCommand.run?.({
      args: {
        config: 'task.config.ts',
        json: true,
      },
    } as never);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toEqual({
      projects: 1,
      repositories: 2,
      agents: 3,
    });
    logSpy.mockRestore();
  });
});
