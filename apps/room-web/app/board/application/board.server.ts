import {
  buildTaskProvider,
  loadConfig,
  type TaskProvider,
} from '@rivus/agent-task-loop/task-management';
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

function formatErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes('No config found') ||
    raw.includes('Config file not found') ||
    raw.includes('agent-task-loop init')
  ) {
    return '未找到任务后端配置。请运行 `agent-task-loop init` 初始化配置，或设置环境变量 AGENT_TASK_LOOP_CONFIG。';
  }
  return `无法加载任务看板：${raw}`;
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
      error: formatErrorMessage(err),
    };
  }
}
