import type { AgentKind, Session, TranscriptEntry } from "@rivus/agent-sessions";
import { renderKeyValues, renderTable, style, type Column } from "../formatters/render.js";

const AGENT_COLOR: Record<AgentKind, (text: string) => string> = {
  codex: style.green,
  claude: style.cyan,
  opencode: style.yellow,
  unknown: style.gray
};

/** Human-friendly age like `5m` / `3h` / `2d`, or `-` when unknown. */
export function relativeAge(iso: string, nowMs: number): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "-";
  const secs = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Aligned, color-coded table of sessions (newest first). */
export function renderSessionTable(sessions: Session[], nowMs: number): string[] {
  if (sessions.length === 0) return [style.dim("No sessions found.")];
  const columns: Column<Session>[] = [
    { header: "Agent", get: (s) => s.agent, color: (s) => AGENT_COLOR[s.agent] ?? style.gray },
    { header: "Session", get: (s) => s.id, color: () => style.bold },
    { header: "Updated", get: (s) => relativeAge(s.updatedAt, nowMs), color: () => style.dim },
    { header: "Path", get: (s) => s.path ?? "-", max: 60, flex: true, color: () => style.dim }
  ];
  return renderTable(columns, sessions);
}

/** Key-value header + transcript body for a single session. */
export function renderInspect(
  session: Session,
  transcript: TranscriptEntry[],
  nowMs: number,
  resumeCommand?: string | null
): string[] {
  const header = renderKeyValues([
    { label: "Session", value: session.id },
    { label: "Agent", value: session.agent },
    { label: "Updated", value: session.updatedAt || "-" },
    { label: "Age", value: relativeAge(session.updatedAt, nowMs) },
    { label: "Path", value: session.path ?? "-" },
    { label: "Resume", value: resumeCommand ?? "(not supported)" }
  ]);
  const body =
    transcript.length === 0
      ? [style.dim("(no transcript)")]
      : transcript.map((e) => (e.role === "tool" ? `${style.dim("⚙")} ${e.toolName ?? e.text}` : `${style.dim(`${e.role}:`)} ${e.text}`));
  return [...header, "", ...body];
}
