import type { CodingAgentId } from '@rivus/agent-kit/catalog';
import type { SessionHead } from '@rivus/agent-kit/sessions';
import type { TranscriptEvent } from '@rivus/agent-kit/transcript';
import { renderKeyValues, renderTable, style, type Column } from '../formatters/render.js';
import { sessionIdOf } from './list.js';

// `Partial` keeps the lookup optional: sessions parsed from external sources may
// carry an agent id outside this table, so the `style.gray` fallback stays live.
const AGENT_COLOR: Partial<Record<CodingAgentId, (text: string) => string>> = {
  'claude-code': style.cyan,
  codex: style.green,
  grok: style.yellow,
};

/** Human-friendly age like `5m` / `3h` / `2d`, or `-` when the time is absent. */
export function relativeAge(epochMs: number | undefined, nowMs: number): string {
  if (epochMs === undefined || !Number.isFinite(epochMs) || epochMs <= 0) {
    return '-';
  }
  const secs = Math.max(0, Math.floor((nowMs - epochMs) / 1000));
  if (secs < 60) {
    return `${secs}s`;
  }
  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    return `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

/** One transcript turn the preview keeps: a spoken message or a tool call. */
type TranscriptTurn = { kind: 'message'; role: string; text: string } | { kind: 'tool'; name: string };

/** The turn of one transcript event, or `null` when the event is bookkeeping. */
function turnOf(event: TranscriptEvent): TranscriptTurn | null {
  const payload = event.payload as { text?: unknown; name?: unknown };
  if (event.kind === 'user' || event.kind === 'assistant' || event.kind === 'reasoning') {
    const text = typeof payload.text === 'string' ? payload.text.replace(/\s+/g, ' ').trim() : '';
    return text ? { kind: 'message', role: event.kind, text } : null;
  }
  if (event.kind === 'tool_call') {
    const name = typeof payload.name === 'string' && payload.name !== '' ? payload.name : 'tool';
    return { kind: 'tool', name };
  }
  return null;
}

function lineOf(turn: TranscriptTurn): string {
  return turn.kind === 'tool' ? `⚙ ${turn.name}` : `${turn.role}: ${turn.text}`;
}

/** The readable lines of a loaded transcript: one per rendered turn, oldest first. */
export function transcriptLines(events: readonly TranscriptEvent[]): string[] {
  return events.map(turnOf).flatMap((turn) => (turn === null ? [] : [lineOf(turn)]));
}

function coloredLineOf(turn: TranscriptTurn): string {
  return turn.kind === 'tool' ? `${style.dim('⚙')} ${turn.name}` : `${style.dim(`${turn.role}:`)} ${turn.text}`;
}

/** Newest first, the order the table and browser display. */
export function byLastActiveDesc(a: SessionHead, b: SessionHead): number {
  return b.lastActiveAt - a.lastActiveAt;
}

/** Aligned, color-coded table of sessions (newest first). */
export function renderSessionTable(sessions: SessionHead[], nowMs: number): string[] {
  if (sessions.length === 0) {
    return [style.dim('No sessions found.')];
  }
  const columns: Column<SessionHead>[] = [
    { header: 'Agent', get: (s) => s.ref.agent, color: (s) => AGENT_COLOR[s.ref.agent] ?? style.gray },
    { header: 'Session', get: (s) => sessionIdOf(s), color: () => style.bold },
    { header: 'Updated', get: (s) => relativeAge(s.lastActiveAt, nowMs), color: () => style.dim },
    { header: 'Path', get: (s) => s.ref.path, max: 60, flex: true, color: () => style.dim },
  ];
  return renderTable(columns, sessions);
}

/** Key-value header + transcript body for a single session. */
export function renderInspect(
  session: SessionHead,
  transcript: TranscriptEvent[],
  nowMs: number,
  resumeCommand?: string | null,
): string[] {
  const header = renderKeyValues([
    { label: 'Session', value: sessionIdOf(session) },
    { label: 'Agent', value: session.ref.agent },
    { label: 'Updated', value: session.lastActiveAt > 0 ? new Date(session.lastActiveAt).toISOString() : '-' },
    { label: 'Age', value: relativeAge(session.lastActiveAt, nowMs) },
    { label: 'Path', value: session.ref.path },
    { label: 'Resume', value: resumeCommand ?? '(not supported)' },
  ]);
  const turns = transcript.map(turnOf).filter((turn): turn is TranscriptTurn => turn !== null);
  const body = turns.length === 0 ? [style.dim('(no transcript)')] : turns.map(coloredLineOf);
  return [...header, '', ...body];
}
