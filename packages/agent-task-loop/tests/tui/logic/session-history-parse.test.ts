import { describe, expect, it } from 'vitest';
import { parseSessionHistory } from '../../../src/tui/logic/session-history-parse';
import { formatSessionHistoryEntry } from '../../../src/services/session-history';
import { isoSecondsAgo } from '../helpers';

describe('parseSessionHistory', () => {
  it('returns [] for blank, whitespace, or undefined input', () => {
    expect(parseSessionHistory(undefined)).toEqual([]);
    expect(parseSessionHistory('')).toEqual([]);
    expect(parseSessionHistory('   \n  \t  \n')).toEqual([]);
  });

  it('parses a full line with all optional fields', () => {
    const ts = isoSecondsAgo(30);
    const line = `[${ts}] | round=2 | kind=execute | agent=claude | name=my-session | id=sess-123 | workspace=/tmp/ws | run=run-9`;
    expect(parseSessionHistory(line)).toEqual([
      {
        timestamp: ts,
        round: 2,
        kind: 'execute',
        agent: 'claude',
        sessionName: 'my-session',
        sessionId: 'sess-123',
        workspacePath: '/tmp/ws',
        runId: 'run-9',
        raw: line,
      },
    ]);
  });

  it('parses a line missing optional name/id segments', () => {
    const ts = isoSecondsAgo(10);
    const line = `[${ts}] | round=1 | kind=review | agent=codex`;
    expect(parseSessionHistory(line)).toEqual([
      {
        timestamp: ts,
        round: 1,
        kind: 'review',
        agent: 'codex',
        raw: line,
      },
    ]);
  });

  it('tolerates a line with workspace but no name/id', () => {
    const ts = isoSecondsAgo(5);
    const line = `[${ts}] | round=3 | kind=execute | agent=glm | workspace=/repo`;
    const [entry] = parseSessionHistory(line);
    expect(entry.workspacePath).toBe('/repo');
    expect(entry.sessionName).toBeUndefined();
    expect(entry.sessionId).toBeUndefined();
  });

  it('preserves input order and skips blank lines between entries', () => {
    const a = `[${isoSecondsAgo(60)}] | round=1 | kind=execute | agent=claude`;
    const b = `[${isoSecondsAgo(30)}] | round=2 | kind=review | agent=codex`;
    const result = parseSessionHistory(`${a}\n\n   \n${b}`);
    expect(result.map(e => e.round)).toEqual([1, 2]);
    expect(result.map(e => e.kind)).toEqual(['execute', 'review']);
  });

  it('skips clearly-malformed lines that lack round+kind+agent', () => {
    const good = `[${isoSecondsAgo(10)}] | round=1 | kind=execute | agent=claude`;
    const result = parseSessionHistory(`total garbage line\n[no-ts] just words\n${good}`);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('execute');
  });

  it('keeps a line that has round+kind+agent even without a timestamp', () => {
    const line = `round=4 | kind=review | agent=coco | id=abc`;
    const [entry] = parseSessionHistory(line);
    expect(entry.timestamp).toBeUndefined();
    expect(entry.round).toBe(4);
    expect(entry.kind).toBe('review');
    expect(entry.agent).toBe('coco');
    expect(entry.sessionId).toBe('abc');
    expect(entry.raw).toBe(line);
  });

  it('round-trips formatSessionHistoryEntry output', () => {
    const inputs = [
      {
        timestamp: isoSecondsAgo(120),
        round: 1,
        kind: 'execute' as const,
        agent: 'claude',
        sessionName: 'feature-x',
        sessionId: 'sid-1',
        workspacePath: '/work/x',
        runId: 'r-1',
      },
      {
        timestamp: isoSecondsAgo(60),
        round: 2,
        kind: 'review' as const,
        agent: 'codex',
      },
    ];

    const text = inputs.map(formatSessionHistoryEntry).join('\n');
    const parsed = parseSessionHistory(text);

    expect(parsed).toHaveLength(2);

    expect(parsed[0]).toMatchObject({
      timestamp: inputs[0].timestamp,
      round: inputs[0].round,
      kind: inputs[0].kind,
      agent: inputs[0].agent,
      sessionName: inputs[0].sessionName,
      sessionId: inputs[0].sessionId,
      workspacePath: inputs[0].workspacePath,
      runId: inputs[0].runId,
    });

    expect(parsed[1]).toMatchObject({
      timestamp: inputs[1].timestamp,
      round: inputs[1].round,
      kind: inputs[1].kind,
      agent: inputs[1].agent,
    });
    expect(parsed[1].sessionName).toBeUndefined();
    expect(parsed[1].sessionId).toBeUndefined();
    expect(parsed[1].workspacePath).toBeUndefined();
    expect(parsed[1].runId).toBeUndefined();
  });
});
