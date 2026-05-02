import { describe, expect, it } from 'vitest';
import { appendSessionHistory, formatSessionHistoryEntry } from '../../src/services/session-history';

describe('session-history', () => {
  it('formats structured session entries', () => {
    const entry = formatSessionHistoryEntry({
      kind: 'execute',
      round: 2,
      agent: 'claude',
      sessionName: 'task-101-claude-r2',
      sessionId: 'sess-2',
      workspacePath: '/tmp/workspace',
      runId: 'run-2',
      timestamp: '2026-04-16T09:00:00Z',
    });

    expect(entry).toContain('round=2');
    expect(entry).toContain('kind=execute');
    expect(entry).toContain('agent=claude');
    expect(entry).toContain('id=sess-2');
  });

  it('appends entries without duplicating the same line', () => {
    const existing = '[2026-04-16T09:00:00Z] | round=1 | kind=execute | agent=claude | id=sess-1';
    const next = '[2026-04-16T09:01:00Z] | round=1 | kind=review | agent=codex | id=review-1';

    expect(appendSessionHistory(existing, next)).toBe(`${existing}\n${next}`);
    expect(appendSessionHistory(existing, existing)).toBe(existing);
  });
});
