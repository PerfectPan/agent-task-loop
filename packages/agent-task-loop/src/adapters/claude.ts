import type { AgentAdapter } from './base';
import { runAgentCommand } from './base';
import { claudeInnerEvent, claudeResultEvents, claudeStreamEvent } from './claude-lines';

function formatClaudeEvent(line: string): string {
  const event = claudeStreamEvent(line);
  if (event === undefined) {
    return `${line}\n`;
  }

  if (event.type === 'stream_event') {
    const payload = claudeInnerEvent(event);

    if (payload?.type === 'content_block_start' && payload.content_block?.type === 'tool_use') {
      return `\n[claude] tool=${String(payload.content_block.name)}\n`;
    }

    if (payload?.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
      return String(payload.delta.text ?? '');
    }

    return '';
  }

  if (event.type === 'result') {
    return event.subtype === 'success' ? `\n[claude] completed\n` : `\n[claude] failed\n`;
  }

  return '';
}

function extractClaudeProgress(line: string): string | undefined {
  try {
    const event = JSON.parse(line) as Record<string, any>;

    if (event.type === 'stream_event') {
      // Same as above: a field of the external JSON stream, possibly missing at runtime.
      const payload: Record<string, any> | undefined = event.event;

      if (payload?.type === 'content_block_start' && payload.content_block?.type === 'tool_use') {
        const toolName = String(payload.content_block.name);
        return `Claude 正在使用 ${toolName} 工具处理任务`;
      }

      if (payload?.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
        const text = String(payload.delta.text ?? '').trim();
        if (text.length >= 12) {
          return text.slice(0, 120);
        }
      }
    }

    if (event.type === 'result' && event.subtype === 'success') {
      return 'Claude 已完成本地执行，正在整理结果';
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function extractClaudeSession(line: string): { sessionId?: string } | undefined {
  try {
    const event = JSON.parse(line) as Record<string, any>;
    if (event.type === 'system' && event.subtype === 'init' && typeof event.session_id === 'string') {
      return { sessionId: event.session_id };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function extractClaudeSummary(output: string): string {
  const found = claudeResultEvents(output).find(
    (event) => event.type === 'result' && event.subtype === 'success' && typeof event.result === 'string',
  );
  if (found && typeof found.result === 'string') {
    return found.result;
  }
  return 'claude execution completed';
}

function extractClaudeError(output: string): string | undefined {
  const found = claudeResultEvents(output).find((event) => event.type === 'result' && event.is_error);
  if (found) {
    return typeof found.result === 'string' ? found.result : 'claude execution failed';
  }
  return undefined;
}

export const claudeAdapter: AgentAdapter = {
  async execute(input) {
    let buffer = '';
    const result = await runAgentCommand(
      input.command,
      [
        ...input.args,
        ...(input.sessionName ? ['-n', input.sessionName] : []),
        '--print',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--verbose',
        '--permission-mode',
        'bypassPermissions',
        input.prompt,
      ],
      input.env,
      input.cwd,
      input.onSpawn,
      input.onHeartbeat,
      (chunk) => {
        buffer += chunk;
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            const session = extractClaudeSession(line);
            if (session) {
              input.onSession?.({
                sessionId: session.sessionId,
                sessionName: input.sessionName,
              });
            }
            const progress = extractClaudeProgress(line);
            if (progress) {
              input.onProgress?.(progress);
            }
            const formatted = formatClaudeEvent(line);
            if (formatted) {
              input.onOutput?.(formatted);
            }
          }
          newlineIndex = buffer.indexOf('\n');
        }
      },
      input.signal,
    );

    if (result.exitCode !== 0) {
      return {
        status: 'failure',
        summary: 'claude execution failed',
        workspacePath: input.workspacePath,
        error: extractClaudeError(result.stdout) ?? (result.stderr || result.stdout),
      };
    }

    return {
      status: 'success',
      summary: extractClaudeSummary(result.stdout),
      workspacePath: input.workspacePath,
    };
  },
};
