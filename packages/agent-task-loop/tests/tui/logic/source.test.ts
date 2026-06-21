import { describe, expect, it } from 'vitest';
import { buildSourceOptions, sourceLabel } from '../../../src/tui/logic/source';

describe('sourceLabel', () => {
  it('shows a dash for missing source', () => {
    expect(sourceLabel(undefined)).toBe('—');
    expect(sourceLabel('')).toBe('—');
  });

  it('keeps feishu as-is', () => {
    expect(sourceLabel('feishu')).toBe('feishu');
  });

  it('shows the repo short name for a github source', () => {
    expect(sourceLabel('github:PerfectPan/agent-task-loop')).toBe('agent-task-loop');
    expect(sourceLabel('github:o/service-a')).toBe('service-a');
  });

  it('falls back to the raw source for anything else', () => {
    expect(sourceLabel('jira')).toBe('jira');
  });
});

describe('buildSourceOptions', () => {
  it('lists configured sources first (incl. empty ones) then extras, with counts', () => {
    const tasks = [
      { source: 'github:o/a' },
      { source: 'github:o/a' },
      { source: 'feishu' },
      { source: 'jira' }, // not configured → appended
    ];
    const options = buildSourceOptions(tasks, ['feishu', 'github:o/a', 'github:o/b']);
    expect(options).toEqual([
      { id: 'feishu', label: 'feishu', count: 1 },
      { id: 'github:o/a', label: 'a', count: 2 },
      { id: 'github:o/b', label: 'b', count: 0 },
      { id: 'jira', label: 'jira', count: 1 },
    ]);
  });
});
