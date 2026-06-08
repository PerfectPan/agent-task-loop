import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '../../../src/types/task';
import { formatDetailFields, formatPriority, timeAgo } from '../../../src/tui/logic/format';
import { fixedNow, isoSecondsAgo } from '../helpers';

const NOW = fixedNow();

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 't1',
    title: 'Title',
    description: 'Desc',
    project: 'proj',
    targetAgent: 'claude',
    priority: 1,
    status: '执行中',
    ...overrides,
  };
}

describe('timeAgo', () => {
  it("returns '—' for undefined / empty / invalid input", () => {
    expect(timeAgo(undefined, NOW)).toBe('—');
    expect(timeAgo('', NOW)).toBe('—');
    expect(timeAgo('not-a-date', NOW)).toBe('—');
  });

  it('formats seconds below the 60s boundary', () => {
    expect(timeAgo(isoSecondsAgo(0), NOW)).toBe('0s ago');
    expect(timeAgo(isoSecondsAgo(59), NOW)).toBe('59s ago');
  });

  it('rolls to minutes at the 60s boundary', () => {
    expect(timeAgo(isoSecondsAgo(60), NOW)).toBe('1m ago');
  });

  it('formats minutes below the 60m boundary', () => {
    expect(timeAgo(isoSecondsAgo(59 * 60), NOW)).toBe('59m ago');
  });

  it('rolls to hours at the 60m boundary', () => {
    expect(timeAgo(isoSecondsAgo(60 * 60), NOW)).toBe('1h ago');
  });

  it('formats hours below the 24h boundary', () => {
    expect(timeAgo(isoSecondsAgo(23 * 60 * 60), NOW)).toBe('23h ago');
  });

  it('rolls to days at the 24h boundary', () => {
    expect(timeAgo(isoSecondsAgo(24 * 60 * 60), NOW)).toBe('1d ago');
  });

  it("clamps future timestamps to '0s ago'", () => {
    expect(timeAgo(isoSecondsAgo(-120), NOW)).toBe('0s ago');
  });
});

describe('formatPriority', () => {
  it("prefixes the number with 'P'", () => {
    expect(formatPriority(0)).toBe('P0');
    expect(formatPriority(1)).toBe('P1');
    expect(formatPriority(42)).toBe('P42');
  });
});

describe('formatDetailFields', () => {
  it('returns the full ordered set when every field is present', () => {
    const task = makeTask({
      status: '待复核',
      targetAgent: 'codex',
      project: 'demo',
      currentOwner: 'alice',
      reviewRound: 2,
      prLink: 'https://pr',
      updatedAt: isoSecondsAgo(30),
    });
    expect(formatDetailFields(task, NOW)).toEqual([
      { label: '状态', value: '待复核' },
      { label: 'Agent', value: 'codex' },
      { label: '项目', value: 'demo' },
      { label: '负责人', value: 'alice' },
      { label: '轮次', value: '2' },
      { label: 'PR', value: 'https://pr' },
      { label: '更新', value: '30s ago' },
    ]);
  });

  it('omits empty / undefined optional fields and preserves order', () => {
    const task = makeTask({
      status: '执行中',
      targetAgent: 'glm',
      project: 'proj',
      currentOwner: undefined,
      reviewRound: undefined,
      prLink: '',
      updatedAt: undefined,
    });
    expect(formatDetailFields(task, NOW)).toEqual([
      { label: '状态', value: '执行中' },
      { label: 'Agent', value: 'glm' },
      { label: '项目', value: 'proj' },
    ]);
  });

  it('maps updated via timeAgo', () => {
    const task = makeTask({ updatedAt: isoSecondsAgo(60 * 60) });
    const rows = formatDetailFields(task, NOW);
    expect(rows.find(r => r.label === '更新')).toEqual({ label: '更新', value: '1h ago' });
  });

  it("includes round '0' since it is a non-empty value", () => {
    const task = makeTask({ reviewRound: 0 });
    expect(formatDetailFields(task, NOW).find(r => r.label === '轮次')).toEqual({
      label: '轮次',
      value: '0',
    });
  });
});
