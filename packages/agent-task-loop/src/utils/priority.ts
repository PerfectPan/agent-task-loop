import type { TaskRecord } from '../types/task';

export function pickNextTask(tasks: TaskRecord[]): TaskRecord | undefined {
  return [...tasks].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  })[0];
}
