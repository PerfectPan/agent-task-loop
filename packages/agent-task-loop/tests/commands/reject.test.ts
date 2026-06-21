import { beforeEach, describe, expect, it, vi } from 'vitest';

const rejectSpy = vi.fn();
const runnerRunSpy = vi.fn();
let capturedRunLoop: ((input: { task: unknown; promptOverride: string; startRound: number }) => Promise<void>) | undefined;

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
  assertRuntimeConfig: vi.fn(),
}));

vi.mock('../../src/services/task-service', () => ({
  TaskService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/services/review-loop-runner', () => ({
  ReviewLoopRunner: vi.fn().mockImplementation(() => ({
    run: runnerRunSpy,
  })),
}));

vi.mock('../../src/services/reject-service', () => ({
  RejectService: vi.fn().mockImplementation(({ runLoop }) => {
    capturedRunLoop = runLoop;
    return {
      reject: rejectSpy,
    };
  }),
}));

describe('rejectCommand', () => {
  beforeEach(() => {
    rejectSpy.mockReset();
    rejectSpy.mockResolvedValue(undefined);
    runnerRunSpy.mockReset();
    runnerRunSpy.mockResolvedValue(undefined);
    capturedRunLoop = undefined;
  });

  it('rejects a task with the provided acceptance feedback', async () => {
    const { rejectCommand } = await import('../../src/commands/reject');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await rejectCommand.run?.({
      args: {
        task: 'TASK-101',
        reason: '单测无效，注释改中文',
        config: 'task.config.ts',
      },
    } as never);

    expect(rejectSpy).toHaveBeenCalledWith({
      taskId: 'TASK-101',
      reason: '单测无效，注释改中文',
    });
    expect(logSpy).toHaveBeenCalledWith('Status: 修复中');
    logSpy.mockRestore();
  });

  it('extends maxRounds to cover the rejection retry window', async () => {
    const { rejectCommand } = await import('../../src/commands/reject');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await rejectCommand.run?.({
      args: {
        task: 'TASK-101',
        reason: '继续看 Pull Request 评论',
        config: 'task.config.ts',
        maxRounds: '5',
      },
    } as never);

    await capturedRunLoop?.({
      task: { taskId: 'TASK-101' },
      promptOverride: 'prompt',
      startRound: 6,
    });

    expect(runnerRunSpy).toHaveBeenCalledWith({
      task: { taskId: 'TASK-101' },
      promptOverride: 'prompt',
      startRound: 6,
      maxRounds: 10,
    });
    logSpy.mockRestore();
  });
});
