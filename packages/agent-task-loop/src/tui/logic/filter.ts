import type { TaskRecord } from '../../types/task';
import { type TabKey, tabIncludes } from './status';

/** Options controlling which tasks survive the filter. */
export interface FilterOptions {
  /** Active tab — slices by status bucket via {@link tabIncludes}. */
  tab: TabKey;
  /**
   * Free-text query. Trimmed; an empty/whitespace query applies no text
   * filter. When present, a task is kept if its taskId, title, or project
   * contains the query (case-insensitive).
   */
  query?: string;
}

/**
 * Filter tasks by tab slice AND free-text query, returning a new array.
 *
 * The tab narrows by status bucket; a non-empty query further narrows to
 * tasks whose taskId, title, or project contains the query case-insensitively.
 */
export function filterTasks(tasks: TaskRecord[], opts: FilterOptions): TaskRecord[] {
  const query = opts.query?.trim().toLowerCase() ?? '';
  return tasks.filter(task => {
    if (!tabIncludes(opts.tab, task.status)) {
      return false;
    }
    if (query === '') {
      return true;
    }
    return (
      task.taskId.toLowerCase().includes(query) ||
      task.title.toLowerCase().includes(query) ||
      task.project.toLowerCase().includes(query)
    );
  });
}
