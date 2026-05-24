import type { TaskRecord, TaskStatus } from '../types/task';

export const STATUS_ORDER: Record<TaskStatus, number> = {
  '执行中': 0,
  '修复中': 1,
  '待复核': 2,
  '待决策': 3,
  '待发布': 4,
  '进行中': 5,
  '待处理': 6,
  '待验收': 7,
  '已失败': 8,
  '已完成': 9,
};

export function sortTasks(a: TaskRecord, b: TaskRecord): number {
  const statusDiff = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
  if (statusDiff !== 0) return statusDiff;
  return b.priority - a.priority;
}
