import { describe, expect, it } from 'vitest';
import { filterTasks } from '../../../src/tui/logic/filter';
import type { TaskRecord, TaskStatus } from '../../../src/types/task';

function task(overrides: Partial<TaskRecord> & { taskId: string; status: TaskStatus }): TaskRecord {
  return {
    title: 'title',
    description: 'desc',
    project: 'proj',
    targetAgent: 'claude',
    priority: 0,
    ...overrides,
  };
}

const tasks: TaskRecord[] = [
  task({ taskId: 'T-1', status: '执行中', title: 'Build login', project: 'auth' }),
  task({ taskId: 'T-2', status: '待处理', title: 'Draft spec', project: 'docs' }),
  task({ taskId: 'T-3', status: '已完成', title: 'Ship release', project: 'core' }),
  task({ taskId: 'T-4', status: '待决策', title: 'Pick db', project: 'infra' }),
  task({ taskId: 'T-5', status: '待验收', title: 'Verify ui', project: 'frontend' }),
  task({ taskId: 'T-6', status: '已失败', title: 'Flaky job', project: 'ci' }),
];

const ids = (records: TaskRecord[]): string[] => records.map(r => r.taskId);

describe('filterTasks', () => {
  it('Active tab keeps 执行中/待处理 and drops 已完成/待决策', () => {
    const result = filterTasks(tasks, { tab: 'active' });
    expect(ids(result)).toEqual(['T-1', 'T-2']);
  });

  it('Needs Input tab keeps 待决策/待验收', () => {
    const result = filterTasks(tasks, { tab: 'needs-input' });
    expect(ids(result)).toEqual(['T-4', 'T-5']);
  });

  it('Done tab keeps 已完成/已失败', () => {
    const result = filterTasks(tasks, { tab: 'done' });
    expect(ids(result)).toEqual(['T-3', 'T-6']);
  });

  it('All tab keeps everything', () => {
    const result = filterTasks(tasks, { tab: 'all' });
    expect(ids(result)).toEqual(['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6']);
  });

  it('query is case-insensitive and matches taskId', () => {
    const result = filterTasks(tasks, { tab: 'all', query: 't-3' });
    expect(ids(result)).toEqual(['T-3']);
  });

  it('query matches title case-insensitively', () => {
    const result = filterTasks(tasks, { tab: 'all', query: 'LOGIN' });
    expect(ids(result)).toEqual(['T-1']);
  });

  it('query matches project case-insensitively', () => {
    const result = filterTasks(tasks, { tab: 'all', query: 'Infra' });
    expect(ids(result)).toEqual(['T-4']);
  });

  it('empty / whitespace query passes all (within tab)', () => {
    expect(ids(filterTasks(tasks, { tab: 'all', query: '' }))).toEqual(ids(tasks));
    expect(ids(filterTasks(tasks, { tab: 'all', query: '   ' }))).toEqual(ids(tasks));
  });

  it('combines tab AND query', () => {
    // 'verify' matches T-5 (待验收) only; under active tab it is excluded.
    expect(ids(filterTasks(tasks, { tab: 'needs-input', query: 'verify' }))).toEqual(['T-5']);
    expect(ids(filterTasks(tasks, { tab: 'active', query: 'verify' }))).toEqual([]);
  });

  it('returns a new array, leaving the input untouched', () => {
    const result = filterTasks(tasks, { tab: 'all' });
    expect(result).not.toBe(tasks);
    expect(tasks).toHaveLength(6);
  });

  it('filters by selected sources (empty/undefined = all)', () => {
    const sourced: TaskRecord[] = [
      task({ taskId: 'S-1', status: '待处理', source: 'github:o/a' }),
      task({ taskId: 'S-2', status: '待处理', source: 'github:o/b' }),
      task({ taskId: 'S-3', status: '待处理', source: 'feishu' }),
    ];
    expect(ids(filterTasks(sourced, { tab: 'all', sources: [] }))).toEqual(['S-1', 'S-2', 'S-3']);
    expect(ids(filterTasks(sourced, { tab: 'all', sources: ['github:o/a'] }))).toEqual(['S-1']);
    expect(ids(filterTasks(sourced, { tab: 'all', sources: ['github:o/a', 'feishu'] }))).toEqual(['S-1', 'S-3']);
  });

  it('query also matches source and repository', () => {
    const sourced: TaskRecord[] = [
      task({ taskId: 'S-1', status: '待处理', source: 'github:o/alpha', repository: 'o/alpha' }),
      task({ taskId: 'S-2', status: '待处理', source: 'github:o/beta', repository: 'o/beta' }),
    ];
    expect(ids(filterTasks(sourced, { tab: 'all', query: 'alpha' }))).toEqual(['S-1']);
  });
});
