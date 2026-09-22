export type {
  AcceptanceVerdict,
  ReviewVerdict,
  TargetAgent,
  TaskRecord,
  TaskStatus,
} from './types/task';
export {
  ACCEPTANCE_VERDICTS,
  REVIEW_VERDICTS,
  TARGET_AGENTS,
  TASK_STATUSES,
} from './types/task';

export type {
  CreateTaskPayload,
  SourceProvider,
  TaskProvider,
  TaskRef,
} from './task-management/task-provider';

export type { BuildTaskProviderOptions } from './task-management/build-task-provider';
export { buildTaskProvider } from './task-management/build-task-provider';

export type { GitHubRepoTarget } from './task-management/github-issues-task-provider';
export {
  GITHUB_SOURCE,
  GitHubIssuesTaskProvider,
  githubSource,
} from './task-management/github-issues-task-provider';

export type { CompositeTaskProviderOptions } from './task-management/composite-task-provider';
export { CompositeTaskProvider } from './task-management/composite-task-provider';

export {
  globalConfigPath,
  loadConfig,
  resolveConfigPath,
} from './config/load-config';

export type { AppConfig } from './config/schema';
