import type { TranscriptEntry } from "./types.js";

/**
 * Reconstruct the legacy one-line-per-turn string format that
 * agent-task-loop's preview renderer expects: `role: text`, except a pure
 * tool-call turn renders as `⚙ name`. This shim keeps the string-based
 * consumer byte-identical while the structured {@link TranscriptEntry} model
 * is adopted.
 */
export function toLines(entries: TranscriptEntry[]): string[] {
  return entries.map((e) =>
    e.role === "tool" ? `⚙ ${e.toolName ?? e.text}` : `${e.role}: ${e.text}`
  );
}
