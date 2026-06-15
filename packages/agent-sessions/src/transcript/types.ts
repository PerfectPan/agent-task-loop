/**
 * A single parsed transcript turn. `role` is preserved verbatim from the
 * source envelope (commonly `user` | `assistant` | `reasoning` | `tool`, but
 * any string a provider emits is kept as-is). `toolName` / `timestamp` capture
 * structure the legacy string-based parser discarded.
 */
export interface TranscriptEntry {
  role: string;
  text: string;
  toolName?: string;
  timestamp?: string;
}
