import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cleanupSpy = vi.fn();

vi.mock('../../src/config/load-config', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    feishu: { baseToken: 'base', tableId: 'table' },
    projects: {},
    repositories: {},
    agents: {},
  }),
}));

vi.mock('../../src/config/runtime-guard', () => ({
  assertRuntimeConfig: vi.fn(),
}));

vi.mock('../../src/services/task-service', () => ({
  TaskService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('../../src/services/publish-context-service', () => ({
  PublishContextService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('../../src/services/cleanup-service', () => ({
  CleanupService: vi.fn().mockImplementation(function () {
    return {
      cleanup: cleanupSpy,
    };
  }),
}));

describe('cleanupCommand', () => {
  beforeEach(() => {
    cleanupSpy.mockReset();
    cleanupSpy.mockResolvedValue({
      branch: 'task/task-102-claude',
      workspacePath: '/tmp/worktree',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints cleanup result', async () => {
    const { cleanupCommand } = await import('../../src/commands/cleanup');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cleanupCommand.run?.({
      args: {
        task: 'TASK-102',
        config: 'task.config.ts',
      },
    } as never);

    expect(cleanupSpy).toHaveBeenCalledWith({ taskId: 'TASK-102', force: false });
    expect(logSpy).toHaveBeenCalledWith('Status: 已清理工作区');
    logSpy.mockRestore();
  });

  it('passes force mode through to cleanup service', async () => {
    const { cleanupCommand } = await import('../../src/commands/cleanup');

    await cleanupCommand.run?.({
      args: {
        task: 'TASK-102',
        force: true,
        config: 'task.config.ts',
      },
    } as never);

    expect(cleanupSpy).toHaveBeenCalledWith({ taskId: 'TASK-102', force: true });
  });

  it('prints cleanup result as json when requested', async () => {
    const { cleanupCommand } = await import('../../src/commands/cleanup');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cleanupCommand.run?.({
      args: {
        task: 'TASK-102',
        force: true,
        config: 'task.config.ts',
        json: true,
      },
    } as never);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toEqual({
      taskId: 'TASK-102',
      branch: 'task/task-102-claude',
      workspacePath: '/tmp/worktree',
      status: '已强制清理工作区',
    });
    logSpy.mockRestore();
  });

  it('rejects a value after --force instead of forcing the cleanup', async () => {
    const { cleanupCommand } = await import('../../src/commands/cleanup');
    const { withCommandGuards } = await import('../../src/commands/command-guards');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    await expect(
      runCommand(withCommandGuards(cleanupCommand), { rawArgs: ['--task', 'TASK-102', '--force', 'false'] }),
    ).rejects.toThrow('exit');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected argument: false.'));
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  it.each([['--force=false'], ['--no-force']])('turns force off with %s', async (flag) => {
    const { cleanupCommand } = await import('../../src/commands/cleanup');
    const { withCommandGuards } = await import('../../src/commands/command-guards');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCommand(withCommandGuards(cleanupCommand), { rawArgs: ['--task', 'TASK-102', flag] });

    expect(cleanupSpy).toHaveBeenCalledWith({ taskId: 'TASK-102', force: false });
  });
});
