import type { AgentAdapter } from './base';
import { runAgentCommand } from './base';

/**
 * Parses the single JSON object printed by `grok -p --output-format json`:
 * `{ text, stopReason, sessionId, … }`.
 */
function parseGrokResult(output: string): {
  text?: string;
  stopReason?: string;
  sessionId?: string;
} {
  try {
    const parsed = JSON.parse(output.trim()) as Record<string, unknown>;
    return {
      text: typeof parsed.text === 'string' ? parsed.text : undefined,
      stopReason: typeof parsed.stopReason === 'string' ? parsed.stopReason : undefined,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
    };
  } catch {
    return {};
  }
}

export const grokAdapter: AgentAdapter = {
  async execute(input) {
    const result = await runAgentCommand(
      input.command,
      [
        ...input.args,
        '-p',
        input.prompt,
        '--output-format',
        'json',
        '--permission-mode',
        'bypassPermissions',
      ],
      input.env,
      input.cwd,
      input.onSpawn,
      input.onHeartbeat,
    );

    if (result.exitCode !== 0) {
      return {
        status: 'failure',
        summary: 'grok execution failed',
        workspacePath: input.workspacePath,
        error: result.stderr || result.stdout,
      };
    }

    const parsed = parseGrokResult(result.stdout);
    if (parsed.sessionId) {
      input.onSession?.({
        sessionId: parsed.sessionId,
        sessionName: input.sessionName,
      });
    }
    if (parsed.stopReason && parsed.stopReason !== 'end_turn') {
      return {
        status: 'failure',
        summary: 'grok execution failed',
        workspacePath: input.workspacePath,
        error: `grok stopped with stopReason=${parsed.stopReason}${parsed.text ? `: ${parsed.text}` : ''}`,
      };
    }

    return {
      status: 'success',
      summary: parsed.text?.trim() || 'grok execution completed',
      workspacePath: input.workspacePath,
    };
  },
};
