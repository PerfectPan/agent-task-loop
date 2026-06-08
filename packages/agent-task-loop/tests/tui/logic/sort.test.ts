import { describe, expect, it } from 'vitest';
import type { TaskRecord, TaskStatus } from '../../../src/types/task';
import { compareTasks, sortTasks } from '../../../src/tui/logic/sort';

/** Minimal TaskRecord factory — only the fields the sort reads matter. */
function task(taskId: string, status: TaskStatus, priority: number): TaskRecord {
  return {
    taskId,
    title: taskId,
    description: '',
    project: 'p',
    targetAgent: 'claude',
    priority,
    status,
  };
}

describe('sortTasks', () => {
  it('orders primarily by status weight ascending', () => {
    const tasks = [
      task('done', '已完成', 0),
      task('exec', '执行中', 0),
      task('queued', '待处理', 0),
    ];
    const ids = sortTasks(tasks).map(t => t.taskId);
    expect(ids).toEqual(['exec', 'queued', 'done']);
  });

  it('tie-breaks equal status by priority descending', () => {
    const tasks = [
      task('low', '执行中', 1),
      task('high', '执行中', 9),
      task('mid', '执行中', 5),
    ];
    const ids = sortTasks(tasks).map(t => t.taskId);
    expect(ids).toEqual(['high', 'mid', 'low']);
  });

  it('combines status weight then priority desc', () => {
    const tasks = [
      task('a', '待处理', 9),
      task('b', '执行中', 1),
      task('c', '执行中', 5),
      task('d', '待处理', 2),
    ];
    const ids = sortTasks(tasks).map(t => t.taskId);
    expect(ids).toEqual(['c', 'b', 'a', 'd']);
  });

  it('is stable for fully-equal keys (preserves input order)', () => {
    const tasks = [
      task('first', '执行中', 5),
      task('second', '执行中', 5),
      task('third', '执行中', 5),
      task('fourth', '执行中', 5),
    ];
    const ids = sortTasks(tasks).map(t => t.taskId);
    expect(ids).toEqual(['first', 'second', 'third', 'fourth']);
  });

  it('returns [] for an empty array', () => {
    expect(sortTasks([])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const tasks = [
      task('done', '已完成', 0),
      task('exec', '执行中', 0),
    ];
    const snapshot = tasks.map(t => t.taskId);
    const sorted = sortTasks(tasks);
    expect(tasks.map(t => t.taskId)).toEqual(snapshot);
    expect(sorted).not.toBe(tasks);
  });
});

describe('compareTasks', () => {
  it('returns negative when a has lower status weight', () => {
    expect(compareTasks(task('a', '执行中', 0), task('b', '已完成', 0))).toBeLessThan(0);
  });

  it('returns positive when a has higher status weight', () => {
    expect(compareTasks(task('a', '已完成', 0), task('b', '执行中', 0))).toBeGreaterThan(0);
  });

  it('returns negative when same status but a has higher priority', () => {
    expect(compareTasks(task('a', '执行中', 9), task('b', '执行中', 1))).toBeLessThan(0);
  });

  it('returns 0 for fully-equal keys', () => {
    expect(compareTasks(task('a', '执行中', 5), task('b', '执行中', 5))).toBe(0);
  });
});
