import type { AgentAdapter } from './base';
import { runAgentCommand } from './base';

function extractCodexSession(chunk: string): { sessionId?: string } | undefined {
  const match = chunk.match(/session id:\s*([a-z0-9-]+)/i);
  if (!match) {
    return undefined;
  }

  return { sessionId: match[1] };
}

export const codexAdapter: AgentAdapter = {
  async execute(input) {
    const result = await runAgentCommand(
      input.command,
      [...input.args, 'exec', input.prompt, '-C', input.cwd],
      input.env,
      input.cwd,
      input.onSpawn,
      input.onHeartbeat,
      chunk => {
        const session = extractCodexSession(chunk);
        if (session) {
          input.onSession?.({
            sessionId: session.sessionId,
            sessionName: input.sessionName,
          });
        }
        input.onOutput?.(chunk);
      },
    );

    if (result.exitCode !== 0) {
      return {
        status: 'failure',
        summary: 'codex execution failed',
        workspacePath: input.workspacePath,
        error: result.stderr || result.stdout,
      };
    }

    return {
      status: 'success',
      summary: result.stdout || 'codex execution completed',
      workspacePath: input.workspacePath,
    };
  },
};
