import type { CreateTaskPayload, TaskProvider } from '../task-management/task-provider';
import type { TargetAgent, TaskRecord, TaskStatus } from '../types/task';
import { toPublicTask, type PublicTaskDto } from './public-task';
import { TaskManagerInputError, TaskManagerOperationError } from './task-manager-error';

export { TaskManagerInputError, TaskManagerOperationError } from './task-manager-error';

export interface ListTasksInput {
  limit: number;
  status?: TaskStatus;
  targetAgent?: TargetAgent;
}

export interface TaskListResult {
  count: number;
  tasks: PublicTaskDto[];
  truncated: boolean;
}

export interface GetTaskInput {
  taskId: string;
}

export interface GetTaskResult {
  task: PublicTaskDto;
}

export interface TaskMutationResult {
  action: 'created';
  taskId: string;
}

export interface StartTaskInput {
  taskId: string;
  targetAgent?: TargetAgent;
  maxRounds: number;
}

export interface TaskStartResult {
  action: 'review-loop-completed';
  task: PublicTaskDto;
  taskId: string;
}

export interface TaskManagerApplication {
  listTasks(input: ListTasksInput): Promise<TaskListResult>;
  getTask(input: GetTaskInput): Promise<GetTaskResult>;
  createTask(input: CreateTaskPayload): Promise<TaskMutationResult>;
  startTask(input: StartTaskInput): Promise<TaskStartResult>;
}

export interface TaskManagerApplicationDependencies {
  taskProvider: TaskProvider;
  startTask(input: StartTaskInput): Promise<TaskRecord>;
}

export function createTaskManagerApplication(
  dependencies: TaskManagerApplicationDependencies,
): TaskManagerApplication {
  return {
    async listTasks(input) {
      const tasks = await callBackend('Unable to list tasks', () => dependencies.taskProvider.listTasks());
      const matchingTasks = tasks.filter(task =>
        (!input.status || task.status === input.status) &&
        (!input.targetAgent || task.targetAgent === input.targetAgent));
      const visibleTasks = matchingTasks.slice(0, input.limit).map(toPublicTask);
      return {
        count: visibleTasks.length,
        tasks: visibleTasks,
        truncated: matchingTasks.length > visibleTasks.length,
      };
    },
    async getTask(input) {
      const task = await callBackend('Unable to get task', () => dependencies.taskProvider.getTaskById(input.taskId));
      if (!task) {
        throw new TaskManagerInputError('task-not-found', `Task ${input.taskId} not found`);
      }
      return { task: toPublicTask(task) };
    },
    async createTask(input) {
      await callBackend('Unable to create task', () => dependencies.taskProvider.createTask(input));
      return { action: 'created', taskId: input.taskId };
    },
    async startTask(input) {
      try {
        await dependencies.startTask(input);
      } catch (error) {
        if (error instanceof TaskManagerInputError) {
          throw error;
        }
        throw new TaskManagerOperationError('task-run-failed', 'Unable to start task run');
      }
      const authoritativeTask = await callBackend('Unable to refresh task', () =>
        dependencies.taskProvider.getTaskById(input.taskId));
      if (!authoritativeTask) {
        throw new TaskManagerOperationError('task-backend-failed', 'Unable to refresh task');
      }
      return {
        action: 'review-loop-completed',
        task: toPublicTask(authoritativeTask),
        taskId: input.taskId,
      };
    },
  };
}

async function callBackend<T>(message: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new TaskManagerOperationError('task-backend-failed', message);
  }
}
