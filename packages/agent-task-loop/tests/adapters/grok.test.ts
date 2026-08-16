import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/adapters/base', () => ({
  runAgentCommand: vi.fn(),
}));

const baseInput = {
  task: {
    taskId: 'TASK-LOOP-1',
    title: 'title',
    description: 'desc',
    project: 'demo',
    targetAgent: 'grok' as const,
    priority: 1,
    status: '待处理' as const,
  },
  workspacePath: '/tmp/workspace',
  cwd: '/tmp/workspace',
  prompt: 'prompt',
  command: 'grok',
  args: [],
  env: {},
  sessionName: 'task-loop-1-grok',
};

describe('grokAdapter', () => {
  it('reports the session id and text from the headless JSON payload', async () => {
    const mod = await import('../../src/adapters/base');
    vi.mocked(mod.runAgentCommand).mockResolvedValue({
      stdout: JSON.stringify({
        text: 'Implemented the fix',
        stopReason: 'end_turn',
        sessionId: '019fc294-c5a1-75f1-8d13-b72f12db1ccf',
      }),
      stderr: '',
      exitCode: 0,
    });

    const { grokAdapter } = await import('../../src/adapters/grok');
    const onSession = vi.fn();
    const result = await grokAdapter.execute({ ...baseInput, onSession });

    expect(result.status).toBe('success');
    expect(result.summary).toBe('Implemented the fix');
    expect(onSession).toHaveBeenCalledWith({
      sessionId: '019fc294-c5a1-75f1-8d13-b72f12db1ccf',
      sessionName: 'task-loop-1-grok',
    });
  });

  it('fails on non-zero exit code', async () => {
    const mod = await import('../../src/adapters/base');
    vi.mocked(mod.runAgentCommand).mockResolvedValue({
      stdout: '',
      stderr: 'grok: auth required',
      exitCode: 1,
    });

    const { grokAdapter } = await import('../../src/adapters/grok');
    const result = await grokAdapter.execute(baseInput);

    expect(result.status).toBe('failure');
    expect(result.error).toBe('grok: auth required');
  });

  it('fails when stopReason reports an abnormal end', async () => {
    const mod = await import('../../src/adapters/base');
    vi.mocked(mod.runAgentCommand).mockResolvedValue({
      stdout: JSON.stringify({ text: 'ran out of turns', stopReason: 'max_turns' }),
      stderr: '',
      exitCode: 0,
    });

    const { grokAdapter } = await import('../../src/adapters/grok');
    const result = await grokAdapter.execute(baseInput);

    expect(result.status).toBe('failure');
    expect(result.error).toContain('max_turns');
  });
});
