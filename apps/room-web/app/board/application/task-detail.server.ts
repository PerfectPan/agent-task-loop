import type { TaskRecord, TaskProvider } from '@rivus/agent-task-loop/task-management';
import { formatTaskLoadError } from './task-config-error';
import { buildTaskProvider, loadConfig } from '@rivus/agent-task-loop/task-management';

export interface TaskDetailView {
  task?: TaskRecord;
  /** Set when the task could not be loaded, or does not exist. */
  error?: string;
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
      error: formatTaskLoadError(err, '任务详情'),
    };
  }
}
