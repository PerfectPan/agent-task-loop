import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/adapters/base', () => ({
  runAgentCommand: vi.fn(),
}));

describe('codexAdapter', () => {
  it('captures codex session id from output', async () => {
    const mod = await import('../../src/adapters/base');
    vi.mocked(mod.runAgentCommand).mockImplementation(async (_command, _args, _env, _cwd, _onSpawn, _onHeartbeat, onOutput) => {
      onOutput?.('OpenAI Codex v0.111.0\nsession id: 019d8d27-3942-7361-9e13-afd8142aa883\n');
      return {
        stdout: 'done',
        stderr: '',
        exitCode: 0,
      };
    });

    const { codexAdapter } = await import('../../src/adapters/codex');
    const onSession = vi.fn();

    await codexAdapter.execute({
      task: {
        taskId: 'TASK-LOOP-1',
        title: 'title',
        description: 'desc',
        project: 'demo',
        targetAgent: 'codex',
        priority: 1,
        status: '待处理',
      },
      workspacePath: '/tmp/workspace',
      cwd: '/tmp/workspace',
      prompt: 'prompt',
      command: 'codex',
      args: [],
      env: {},
      sessionName: 'task-loop-1-codex',
      onSession,
    });

    expect(onSession).toHaveBeenCalledWith({
      sessionId: '019d8d27-3942-7361-9e13-afd8142aa883',
      sessionName: 'task-loop-1-codex',
    });
  });
});
