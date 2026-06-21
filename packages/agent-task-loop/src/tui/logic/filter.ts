import type { TaskRecord } from '../../types/task';
import { type TabKey, tabIncludes } from './status';

/** Options controlling which tasks survive the filter. */
export interface FilterOptions {
  /** Active tab — slices by status bucket via {@link tabIncludes}. */
  tab: TabKey;
  /**
   * Free-text query. Trimmed; an empty/whitespace query applies no text
   * filter. When present, a task is kept if its taskId, title, project,
   * source, or repository contains the query (case-insensitive).
   */
  query?: string;
  /**
   * Selected source ids. `undefined` or empty applies no source filter; when
   * non-empty, only tasks whose `source` is in the set are kept.
   */
  sources?: readonly string[];
}

/**
 * Filter tasks by tab slice AND source selection AND free-text query, returning
 * a new array. The tab narrows by status bucket; the source set narrows to the
 * selected backends; a non-empty query further narrows by text.
 */
export function filterTasks(tasks: TaskRecord[], opts: FilterOptions): TaskRecord[] {
  const query = opts.query?.trim().toLowerCase() ?? '';
  const sources = opts.sources && opts.sources.length > 0 ? new Set(opts.sources) : null;
  return tasks.filter(task => {
    if (!tabIncludes(opts.tab, task.status)) {
      return false;
    }
    if (sources && !sources.has(task.source ?? '')) {
      return false;
    }
    if (query === '') {
      return true;
    }
    return (
      task.taskId.toLowerCase().includes(query) ||
      task.title.toLowerCase().includes(query) ||
      task.project.toLowerCase().includes(query) ||
      (task.source ?? '').toLowerCase().includes(query) ||
      (task.repository ?? '').toLowerCase().includes(query)
    );
  });
}
