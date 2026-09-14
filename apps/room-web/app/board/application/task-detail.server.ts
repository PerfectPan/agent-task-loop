import type { TaskRecord, TaskProvider } from '@rivus/agent-task-loop/task-management';
import { buildTaskProvider, loadConfig } from '@rivus/agent-task-loop/task-management';

export interface TaskDetailView {
  task?: TaskRecord;
  /** Set when the task could not be loaded, or does not exist. */
  error?: string;
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
  return `无法加载任务详情：${raw}`;
}

export async function loadTaskDetail(
  taskId: string,
  provider?: TaskProvider,
): Promise<TaskDetailView> {
  const trimmedId = (taskId ?? '').trim();
  if (!trimmedId) {
    return {
      error: '任务 ID 不能为空。',
    };
  }

  try {
    const activeProvider = provider ?? buildTaskProvider(await loadConfig());
    const task = await activeProvider.getTaskById(trimmedId);
    if (!task) {
      return {
        error: `未找到任务 "${trimmedId}"。`,
      };
    }
    return { task };
  } catch (err) {
    return {
      error: formatErrorMessage(err),
    };
  }
}
