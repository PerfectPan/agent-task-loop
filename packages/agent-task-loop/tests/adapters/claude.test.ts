import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/adapters/base', () => ({
  runAgentCommand: vi.fn(),
}));

describe('claudeAdapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('passes a stable session name and reports the parsed session id', async () => {
    const base = await import('../../src/adapters/base');
    vi.mocked(base.runAgentCommand).mockImplementation(async (_command, args, _env, _cwd, _onSpawn, _onHeartbeat, onOutput) => {
      onOutput?.('{"type":"system","subtype":"init","session_id":"sess-123"}\n');
      onOutput?.('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Working..."}}}\n');
      return {
        stdout: [
          '{"type":"system","subtype":"init","session_id":"sess-123"}',
          '{"type":"result","subtype":"success","is_error":false,"result":"done"}',
        ].join('\n'),
        stderr: '',
        exitCode: 0,
      };
    });

    const { claudeAdapter } = await import('../../src/adapters/claude');
    const onSession = vi.fn();

    const result = await claudeAdapter.execute({
      task: {
        taskId: 'TASK-101',
        title: 'Fix bug',
        description: 'desc',
        project: 'demo',
        targetAgent: 'claude',
        priority: 1,
        status: '待处理',
      },
      workspacePath: '/tmp/TASK-101-claude',
      cwd: '/tmp/TASK-101-claude',
      prompt: 'do the task',
      command: 'claude',
      args: [],
      env: {},
      sessionName: 'task-101-claude',
      onSession,
    });

    expect(base.runAgentCommand).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['-n', 'task-101-claude']),
      {},
      '/tmp/TASK-101-claude',
      undefined,
      undefined,
      expect.any(Function),
    );
    expect(onSession).toHaveBeenCalledWith({
      sessionId: 'sess-123',
      sessionName: 'task-101-claude',
    });
    expect(result.summary).toBe('done');
  });
});
