import type { AgentRecord } from "@rivus/agent-finder-core";
import { renderTable, style, type Column } from "./render.js";
import { summarizeAgents } from "../summary/summarize-agents.js";

type AgentStatus = AgentRecord["status"];

interface StatusStyle {
  glyph: string;
  color: (text: string) => string;
  label: string;
}

export const STATUS_THEME: Record<AgentStatus, StatusStyle> = {
  runnable: { glyph: "●", color: style.green, label: "runnable" },
  found: { glyph: "○", color: style.cyan, label: "found" },
  missing: { glyph: "✗", color: style.red, label: "missing" },
  unknown: { glyph: "·", color: style.gray, label: "unknown" }
};

function location(agent: AgentRecord): string {
  return agent.command ?? agent.app_path ?? "-";
}

const COLUMNS: Column<AgentRecord>[] = [
  {
    header: "Status",
    get: (a) => `${STATUS_THEME[a.status].glyph} ${STATUS_THEME[a.status].label}`,
    color: (a) => STATUS_THEME[a.status].color
  },
  { header: "Provider", get: (a) => a.name, color: () => style.bold },
  { header: "Type", get: (a) => a.type },
  { header: "Version", get: (a) => a.version ?? "-", max: 22, color: (a) => (a.version ? style.dim : style.gray) },
  { header: "Location", get: location, max: 64, flex: true, color: () => style.dim }
];

/** Sort runnable first, then found, missing, unknown; stable by name within a group. */
const STATUS_ORDER: Record<AgentStatus, number> = { runnable: 0, found: 1, missing: 2, unknown: 3 };

function sortAgents(agents: AgentRecord[]): AgentRecord[] {
  return [...agents].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)
  );
}

/** The aligned, color-coded agent inventory table. */
export function renderAgentTable(agents: AgentRecord[]): string[] {
  if (agents.length === 0) return [style.dim("No agents discovered.")];
  return renderTable(COLUMNS, sortAgents(agents));
}

/** A one-line status roll-up plus an optional warning hint. */
export function renderScanSummary(agents: AgentRecord[]): string[] {
  const summary = summarizeAgents(agents);
  const segments = [
    `${summary.total} agents`,
    STATUS_THEME.runnable.color(`${STATUS_THEME.runnable.glyph} ${summary.runnable} runnable`),
    STATUS_THEME.found.color(`${STATUS_THEME.found.glyph} ${summary.found} found`),
    STATUS_THEME.missing.color(`${STATUS_THEME.missing.glyph} ${summary.missing} missing`),
    STATUS_THEME.unknown.color(`${STATUS_THEME.unknown.glyph} ${summary.unknown} unknown`)
  ];
  const lines = [segments.join(style.dim("   "))];
  if (summary.warnings.length > 0) {
    lines.push(
      style.dim(`${summary.warnings.length} warning(s) — run \`agent-finder doctor\` for details`)
    );
  }
  return lines;
}
