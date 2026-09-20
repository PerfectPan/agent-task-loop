import {
  buildTaskProvider,
  loadConfig,
  type TaskProvider,
} from '@rivus/agent-task-loop/task-management';
import { formatTaskLoadError } from './task-config-error';
import { groupIntoLanes, type Lane } from '../domain/lanes';

export interface BoardView {
  lanes: Lane[];
  /** Distinct `source` values present in the loaded tasks, sorted. */
  sources: string[];
  /** Set when the board could not be loaded. Lanes are then all empty. */
  error?: string;
}

function extractSources(tasks: { source?: string }[]): string[] {
  const sourceSet = new Set<string>();
  for (const task of tasks) {
    if (task.source && typeof task.source === 'string') {
      const trimmed = task.source.trim();
      if (trimmed) {
        sourceSet.add(trimmed);
      }
    }
  }
  return Array.from(sourceSet).sort((a, b) => a.localeCompare(b));
}

/** Loads the board. Pass a provider to bypass config resolution in tests. */
export async function loadBoard(provider?: TaskProvider): Promise<BoardView> {
  try {
    const activeProvider = provider ?? buildTaskProvider(await loadConfig());
    const tasks = await activeProvider.listTasks();
    return {
      lanes: groupIntoLanes(tasks),
      sources: extractSources(tasks),
    };
  } catch (err) {
    return {
      lanes: groupIntoLanes([]),
      sources: [],
      error: formatTaskLoadError(err, '任务看板'),
    };
  }
}
