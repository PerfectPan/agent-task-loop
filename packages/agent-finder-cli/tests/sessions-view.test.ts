import { describe, expect, it } from 'vite-plus/test';
import type { SessionHead } from '@rivus/agent-kit/sessions';
import type { TranscriptEvent } from '@rivus/agent-kit/transcript';
import { relativeAge, renderInspect, renderSessionTable, transcriptLines } from '../src/sessions/view.js';

const NOW = Date.parse('2026-06-15T12:00:00Z');

function head(agent: SessionHead['ref']['agent'], path: string, overrides: Partial<SessionHead> = {}): SessionHead {
  return {
    lastActiveAt: Date.parse('2026-06-15T11:00:00Z'),
    sizeBytes: 100,
    ...overrides,
    ref: { agent, path, ...overrides.ref },
  };
}

const SESSIONS: SessionHead[] = [
  head('codex', '/c/aaaaaaaa-1111-4111-8111-111111111111.jsonl', {
    ref: {
      agent: 'codex',
      path: '/c/aaaaaaaa-1111-4111-8111-111111111111.jsonl',
      sessionId: 'aaaaaaaa-1111-4111-8111-111111111111',
    },
  }),
  head('claude-code', '/cl/bbbbbbbb-2222-4222-8222-222222222222.jsonl', {
    lastActiveAt: Date.parse('2026-06-13T12:00:00Z'),
    ref: {
      agent: 'claude-code',
      path: '/cl/bbbbbbbb-2222-4222-8222-222222222222.jsonl',
      sessionId: 'bbbbbbbb-2222-4222-8222-222222222222',
    },
  }),
];

const EVENT = (overrides: Partial<TranscriptEvent>): TranscriptEvent =>
  ({
    id: 'e1',
    seq: 0,
    ts: NOW,
    kind: 'assistant',
    payload: { text: 'done' },
    source: { file: '/c/a.jsonl', offset: 0, length: 10 },
    ...overrides,
  }) as TranscriptEvent;

describe('relativeAge', () => {
  it('formats seconds/minutes/hours/days and handles missing/invalid', () => {
    expect(relativeAge(Date.parse('2026-06-15T11:59:30Z'), NOW)).toBe('30s');
    expect(relativeAge(Date.parse('2026-06-15T11:30:00Z'), NOW)).toBe('30m');
    expect(relativeAge(Date.parse('2026-06-15T11:00:00Z'), NOW)).toBe('1h');
    expect(relativeAge(Date.parse('2026-06-13T12:00:00Z'), NOW)).toBe('2d');
    expect(relativeAge(undefined, NOW)).toBe('-');
    expect(relativeAge(Number.NaN, NOW)).toBe('-');
  });
});

describe('renderSessionTable', () => {
  it('renders a header + a row per session with agent, id and age', () => {
    const lines = renderSessionTable(SESSIONS, NOW).join('\n');
    expect(lines).toContain('AGENT');
    expect(lines).toContain('codex');
    expect(lines).toContain('claude-code');
    expect(lines).toContain('1h');
    expect(lines).toContain('2d');
    expect(lines).toContain(SESSIONS[0].ref.sessionId);
  });

  it('shows an empty-state line when there are no sessions', () => {
    expect(renderSessionTable([], NOW)).toEqual(['No sessions found.']);
  });
});

describe('transcriptLines', () => {
  it('renders message turns and tool calls, dropping bookkeeping', () => {
    expect(
      transcriptLines([
        EVENT({ kind: 'user', payload: { text: 'please review' } }),
        EVENT({ kind: 'reasoning', payload: { text: 'thinking' } }),
        EVENT({ kind: 'tool_call', payload: { callId: 'c1', name: 'Read' } }),
        EVENT({ kind: 'tool_result', payload: { callId: 'c1', output: 'file' } }),
        EVENT({ kind: 'request', payload: { model: 'x' } }),
        EVENT({ kind: 'unknown', payload: { type: 'event_msg' } }),
        EVENT({ kind: 'assistant', payload: {} }),
      ]),
    ).toEqual(['user: please review', 'reasoning: thinking', '⚙ Read']);
  });
});

describe('renderInspect', () => {
  it('renders metadata header and transcript body', () => {
    const out = renderInspect(SESSIONS[0], [EVENT({})], NOW).join('\n');
    expect(out).toContain('Session:');
    expect(out).toContain(SESSIONS[0].ref.sessionId);
    expect(out).toContain('codex');
    expect(out).toContain('assistant: done');
  });

  it('shows the resume command when supported, else (not supported)', () => {
    const withResume = renderInspect(SESSIONS[0], [], NOW, `codex resume ${SESSIONS[0].ref.sessionId}`).join('\n');
    expect(withResume).toContain(`Resume:`);
    expect(withResume).toContain(`codex resume ${SESSIONS[0].ref.sessionId}`);

    const noResume = renderInspect(SESSIONS[0], [], NOW, null).join('\n');
    expect(noResume).toContain('(not supported)');
  });

  it('notes an empty transcript', () => {
    const out = renderInspect(SESSIONS[0], [], NOW).join('\n');
    expect(out).toContain('(no transcript)');
  });
});
