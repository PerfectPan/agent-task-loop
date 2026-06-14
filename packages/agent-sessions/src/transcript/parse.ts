import type { TranscriptEntry } from "./types.js";

/**
 * Parse agent session transcripts (JSONL) into structured {@link TranscriptEntry}
 * turns. Handles both the Codex rollout shape (`{type, payload}`) and the
 * Claude/Anthropic session shape (`{type, message:{role, content}}`), keeping
 * user/assistant/reasoning messages and tool calls while dropping bookkeeping
 * noise (token counts, session meta, raw tool output).
 *
 * Rewritten from agent-task-loop's `tui/logic/transcript.ts`, which emitted
 * lossy `role: text` strings and dropped tool names and timestamps. Use
 * {@link ../to-lines.toLines} to reconstruct the legacy string format.
 */

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

interface Flattened {
  text: string;
  toolName?: string;
}

/** Flatten a message `content` (string | array of parts | object) to text. */
function flattenContent(content: unknown): Flattened {
  if (content == null) return { text: "" };
  if (typeof content === "string") return { text: content };
  if (Array.isArray(content)) {
    let toolName: string | undefined;
    const parts = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") return p.text;
          if (p.type === "tool_use" && typeof p.name === "string") {
            toolName ??= p.name;
            return `⚙ ${p.name}`;
          }
          if (p.type === "tool_result") return "";
        }
        return "";
      })
      .filter(Boolean);
    return { text: parts.join(" "), toolName };
  }
  if (typeof content === "object") {
    const c = content as Record<string, unknown>;
    return { text: typeof c.text === "string" ? c.text : "" };
  }
  return { text: String(content) };
}

function entry(role: string, content: unknown, timestamp?: string): TranscriptEntry | null {
  const flat = typeof content === "string" ? { text: content } : flattenContent(content);
  const text = collapse(flat.text);
  if (!text) return null;
  const result: TranscriptEntry = { role, text };
  if (flat.toolName) result.toolName = flat.toolName;
  if (timestamp) result.timestamp = timestamp;
  return result;
}

/** Parse one JSONL line into a transcript entry, or null to skip it. */
export function parseTranscriptLine(raw: string): TranscriptEntry | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const timestamp = typeof obj.timestamp === "string" ? obj.timestamp : undefined;

  // Codex rollout envelope.
  const payload = obj.payload as Record<string, unknown> | undefined;
  if (payload && typeof payload === "object") {
    switch (payload.type) {
      case "agent_message":
        return entry("assistant", payload.message, timestamp);
      case "user_message":
        return entry("user", payload.message, timestamp);
      case "reasoning":
        return entry("reasoning", payload.summary ?? payload.content, timestamp);
      case "message":
        return entry(String(payload.role ?? obj.role ?? "assistant"), payload.content, timestamp);
      case "function_call": {
        const name = String(payload.name ?? "tool");
        const result: TranscriptEntry = { role: "tool", text: name, toolName: name };
        if (timestamp) result.timestamp = timestamp;
        return result;
      }
      default:
        return null; // token_count, task_started, function_call_output, meta…
    }
  }

  // Claude / Anthropic session shape.
  const message = obj.message as Record<string, unknown> | undefined;
  if (message && typeof message === "object") {
    return entry(String(message.role ?? obj.type ?? "assistant"), message.content, timestamp);
  }
  if (obj.role && "content" in obj) {
    return entry(String(obj.role), obj.content, timestamp);
  }
  return null;
}

/** Parse a full JSONL transcript, keeping the last `maxLines` readable turns. */
export function parseTranscript(content: string | undefined, maxLines: number): TranscriptEntry[] {
  if (!content || maxLines <= 0) return [];
  const entries: TranscriptEntry[] = [];
  for (const raw of content.split("\n")) {
    if (!raw.trim()) continue;
    const parsed = parseTranscriptLine(raw);
    if (parsed) entries.push(parsed);
  }
  return entries.slice(-maxLines);
}
