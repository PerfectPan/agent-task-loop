import type { AppConfig } from '../config/schema';
import type { TaskRecord } from '../types/task';

export interface TaskExecutionContext {
  projectKey: string;
  project: AppConfig['projects'][string];
  repositoryKey: string;
  repository: AppConfig['repositories'][string];
}

function formatKnownKeys(record: Record<string, unknown>): string {
  const keys = Object.keys(record);
  return keys.length > 0 ? keys.join(', ') : '(none)';
}

export function resolveTaskExecutionContext(config: AppConfig, task: TaskRecord): TaskExecutionContext {
  const projectKey = task.project;
  const project = config.projects[projectKey];

  if (!project) {
    throw new Error(
      `Task ${task.taskId} references unknown project "${projectKey}". ` +
        `Known projects: ${formatKnownKeys(config.projects)}. ` +
        `Update your config (projects/repositories) or fix the task source (Feishu row / GitHub issue).`,
    );
  }

  const repositoryKey = task.repository ?? project.defaultRepository;
  const repository = config.repositories[repositoryKey];

  if (!repository) {
    throw new Error(
      `Task ${task.taskId} references unknown repository "${repositoryKey}". ` +
        `Known repositories: ${formatKnownKeys(config.repositories)}. ` +
        `Update your config (projects/repositories) or fix the task source (Feishu row / GitHub issue).`,
    );
  }

  return {
    projectKey,
    project,
    repositoryKey,
    repository,
  };
}
