import type { TaskRecord } from '../../types/task';
import { statusWeight } from './status';

/**
 * Compare two tasks for the dashboard list ordering.
 *
 * Primary key: status weight ascending (most in-flight first, terminal last).
 * Tie-break: priority descending (higher priority number first).
 * Returns 0 when both keys are equal so callers relying on a stable sort keep
 * the original relative order.
 */
export function compareTasks(a: TaskRecord, b: TaskRecord): number {
  const byStatus = statusWeight(a.status) - statusWeight(b.status);
  if (byStatus !== 0) {
    return byStatus;
  }
  return b.priority - a.priority;
}

/**
 * Return a new array sorted by {@link compareTasks}. The input is never mutated.
 * Array.prototype.sort is a stable sort (ES2019+), so fully-equal keys retain
 * their original relative order.
 */
export function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort(compareTasks);
}
