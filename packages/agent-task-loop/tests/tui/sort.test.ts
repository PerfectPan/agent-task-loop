import { describe, it, expect } from 'vitest';
import { sortTasks, STATUS_ORDER } from '../../src/tui/sort';
import type { TaskRecord } from '../../src/types/task';

function makeTask(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    taskId: 'TASK-001',
    title: 'Test task',
    description: '',
    project: 'test',
    targetAgent: 'claude',
    priority: 2,
    status: '待处理',
    ...overrides,
  };
}

describe('sortTasks', () => {
  it('puts running tasks before pending ones', () => {
    const tasks = [
      makeTask({ taskId: 'A', status: '待处理' }),
      makeTask({ taskId: 'B', status: '执行中' }),
    ];
    const sorted = tasks.slice().sort(sortTasks);
    expect(sorted[0]!.taskId).toBe('B');
    expect(sorted[1]!.taskId).toBe('A');
  });

  it('orders by status priority: 执行中 < 修复中 < 待复核 < 待处理 < 已完成', () => {
    const tasks = [
      makeTask({ taskId: 'done', status: '已完成' }),
      makeTask({ taskId: 'pending', status: '待处理' }),
      makeTask({ taskId: 'review', status: '待复核' }),
      makeTask({ taskId: 'fixing', status: '修复中' }),
      makeTask({ taskId: 'running', status: '执行中' }),
    ];
    const sorted = tasks.slice().sort(sortTasks);
    expect(sorted.map(t => t.taskId)).toEqual(['running', 'fixing', 'review', 'pending', 'done']);
  });

  it('within same status, sorts by priority descending', () => {
    const tasks = [
      makeTask({ taskId: 'low', status: '待处理', priority: 1 }),
      makeTask({ taskId: 'high', status: '待处理', priority: 3 }),
      makeTask({ taskId: 'mid', status: '待处理', priority: 2 }),
    ];
    const sorted = tasks.slice().sort(sortTasks);
    expect(sorted.map(t => t.taskId)).toEqual(['high', 'mid', 'low']);
  });

  it('status order covers all defined statuses', () => {
    const allStatuses = Object.keys(STATUS_ORDER);
    expect(allStatuses).toHaveLength(10);
  });
});
