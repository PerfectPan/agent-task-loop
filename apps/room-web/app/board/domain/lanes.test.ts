import type { TaskRecord, TaskStatus } from '@rivus/agent-task-loop/task-management';
import { describe, expect, it } from 'vitest';
import { groupIntoLanes, laneOf, type LaneId } from './lanes';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'task-1',
    title: 'Sample Task',
    description: 'Sample Description',
    project: 'idea',
    targetAgent: 'codex',
    priority: 1,
    status: '待处理',
    ...overrides,
  };
}

describe('board lanes domain', () => {
  it('every one of the ten statuses lands in the lane the table names', () => {
    const expectedMappings: Array<[TaskStatus, LaneId]> = [
      ['待处理', 'todo'],
      ['进行中', 'running'],
      ['执行中', 'running'],
      ['修复中', 'running'],
      ['待复核', 'review'],
      ['待决策', 'decide'],
      ['待发布', 'decide'],
      ['待验收', 'decide'],
      ['已完成', 'done'],
      ['已失败', 'done'],
    ];

    for (const [status, expectedLaneId] of expectedMappings) {
      expect(laneOf(status)).toBe(expectedLaneId);

      const lanes = groupIntoLanes([makeTask({ taskId: `task-${status}`, status })]);
      const targetLane = lanes.find((lane) => lane.id === expectedLaneId);
      expect(targetLane?.tasks.map((task) => task.status)).toEqual([status]);
    }
  });

  it('all five lanes come back in fixed order when the input is empty', () => {
    const lanes = groupIntoLanes([]);

    expect(lanes.map((lane) => lane.id)).toEqual(['todo', 'running', 'review', 'decide', 'done']);
    expect(lanes.map((lane) => lane.title)).toEqual(['待办', '进行中', '审核中', '待你决定', '已结束']);
    expect(lanes.every((lane) => lane.tasks.length === 0)).toBe(true);
  });

  it('the sort inside a lane: priority first, then updatedAt descending, then taskId', () => {
    const tasks: TaskRecord[] = [
      makeTask({
        taskId: 'task-d',
        status: '进行中',
        priority: 1,
        updatedAt: '2026-03-01T10:00:00.000Z',
      }),
      makeTask({
        taskId: 'task-b',
        status: '进行中',
        priority: 0,
        updatedAt: '2026-03-01T12:00:00.000Z',
      }),
      makeTask({
        taskId: 'task-a',
        status: '进行中',
        priority: 0,
        updatedAt: '2026-03-01T12:00:00.000Z',
      }),
      makeTask({
        taskId: 'task-c',
        status: '进行中',
        priority: 0,
        updatedAt: '2026-03-01T09:00:00.000Z',
      }),
      makeTask({
        taskId: 'task-e',
        status: '进行中',
        priority: 1,
        updatedAt: undefined,
      }),
      makeTask({
        taskId: 'task-g',
        status: '进行中',
        priority: undefined,
        updatedAt: '2026-03-01T15:00:00.000Z',
      }),
      makeTask({
        taskId: 'task-f',
        status: '进行中',
        priority: undefined,
        updatedAt: '2026-03-01T15:00:00.000Z',
      }),
    ];

    const lanes = groupIntoLanes(tasks);
    const runningLane = lanes.find((lane) => lane.id === 'running');

    expect(runningLane?.tasks.map((task) => task.taskId)).toEqual([
      'task-a', // priority 0, updatedAt 12:00, taskId 'task-a'
      'task-b', // priority 0, updatedAt 12:00, taskId 'task-b'
      'task-c', // priority 0, updatedAt 09:00
      'task-d', // priority 1, updatedAt 10:00
      'task-e', // priority 1, updatedAt missing
      'task-f', // priority missing, updatedAt 15:00, taskId 'task-f'
      'task-g', // priority missing, updatedAt 15:00, taskId 'task-g'
    ]);
  });

  it('an unknown status is dropped rather than throwing', () => {
    const tasks: TaskRecord[] = [
      makeTask({ taskId: 'valid-1', status: '待处理' }),
      makeTask({ taskId: 'invalid-1', status: 'UNKNOWN_STATUS' as TaskStatus }),
      makeTask({ taskId: 'invalid-2', status: '' as TaskStatus }),
      makeTask({ taskId: 'valid-2', status: '已完成' }),
    ];

    expect(() => groupIntoLanes(tasks)).not.toThrow();

    const lanes = groupIntoLanes(tasks);
    const allCollectedTasks = lanes.flatMap((lane) => lane.tasks);
    expect(allCollectedTasks.map((task) => task.taskId)).toEqual(['valid-1', 'valid-2']);
  });

  it('the input array is not mutated', () => {
    const originalTasks: readonly TaskRecord[] = Object.freeze([
      Object.freeze(makeTask({ taskId: 'task-2', priority: 2 })),
      Object.freeze(makeTask({ taskId: 'task-1', priority: 1 })),
    ]);

    const copy = [...originalTasks];
    const lanes = groupIntoLanes(originalTasks);

    expect(originalTasks).toEqual(copy);
    expect(lanes[0].tasks).not.toBe(originalTasks);
  });
});
