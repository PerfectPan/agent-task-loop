/**
 * Turn an agent session transcript (JSONL) into readable one-liners for the
 * preview pane. Handles both the Codex rollout shape (`{type, payload}`) and
 * the Claude/Anthropic session shape (`{type, message:{role, content}}`),
 * keeping user/assistant/reasoning messages and tool calls while dropping
 * bookkeeping noise (token counts, session meta, raw tool output).
 */

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Flatten a message `content` (string | array of parts | object) to text. */
function textFromContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          if (typeof p.text === 'string') return p.text;
          if (p.type === 'tool_use' && typeof p.name === 'string') return `⚙ ${p.name}`;
          if (p.type === 'tool_result') return '';
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  if (typeof content === 'object') {
    const c = content as Record<string, unknown>;
    return typeof c.text === 'string' ? c.text : '';
  }
  return String(content);
}

function label(role: string, text: unknown): string | null {
  const t = collapse(typeof text === 'string' ? text : textFromContent(text));
  if (!t) return null;
  return `${role}: ${t}`;
}

/** Parse one JSONL line into a readable transcript line, or null to skip it. */
export function parseTranscriptLine(raw: string): string | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Codex rollout envelope.
  const payload = obj.payload as Record<string, unknown> | undefined;
  if (payload && typeof payload === 'object') {
    switch (payload.type) {
      case 'agent_message':
        return label('assistant', payload.message);
      case 'user_message':
        return label('user', payload.message);
      case 'reasoning':
        return label('reasoning', payload.summary ?? payload.content);
      case 'message':
        return label(String(payload.role ?? obj.role ?? 'assistant'), payload.content);
      case 'function_call':
        return `⚙ ${String(payload.name ?? 'tool')}`;
      default:
        return null; // token_count, task_started, function_call_output, meta…
    }
  }

  // Claude / Anthropic session shape.
  const message = obj.message as Record<string, unknown> | undefined;
  if (message && typeof message === 'object') {
    return label(String(message.role ?? obj.type ?? 'assistant'), message.content);
  }
  if (obj.role && 'content' in obj) {
    return label(String(obj.role), obj.content);
  }
  return null;
}

/** Parse a full JSONL transcript, keeping the last `maxLines` readable lines. */
export function parseTranscript(content: string | undefined, maxLines: number): string[] {
  if (!content || maxLines <= 0) return [];
  const lines: string[] = [];
  for (const raw of content.split('\n')) {
    if (!raw.trim()) continue;
    const parsed = parseTranscriptLine(raw);
    if (parsed) lines.push(parsed);
  }
  return lines.slice(-maxLines);
}
