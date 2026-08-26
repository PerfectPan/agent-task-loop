import { loadConfig } from '../config/load-config';
import { normalizeGitHubRepos } from '../config/github-repos';
import { assertRuntimeConfig } from '../config/runtime-guard';
import type { AppConfig } from '../config/schema';
import { ReviewLoopRunner } from '../services/review-loop-runner';
import { TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
import { TaskService } from '../services/task-service';
import { githubSource } from '../task-management/github-issues-task-provider';
import { BackgroundStartService } from './background-start';
import {
  createTaskManagerApplication,
  type TaskManagerApplication,
} from './task-manager-application';
import { TaskStartService } from './task-start-service';
import { TaskTraceService } from './task-trace-service';

/**
 * Public workspace snapshot for the desktop console.
 * Deliberately omits absolute paths, tokens, and credentials.
 */
export interface DesktopWorkspaceSnapshot {
  projects: Array<{
    key: string;
    name: string;
    defaultRepository: string;
  }>;
  repositories: Array<{
    key: string;
    defaultBranch: string;
    workspaceStrategy: 'existing-repo' | 'worktree';
  }>;
  sources: string[];
  agents: string[];
  /** Preferred coding agent for free-form console chat, if configured. */
  chatAgent?: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  };
}

export interface ConfiguredDesktopServices {
  application: TaskManagerApplication;
  backgroundStart: BackgroundStartService;
  workspace: DesktopWorkspaceSnapshot;
  trace: TaskTraceService;
}

/**
 * Create the Task Manager application + background start service with shared
 * dependencies (config, task provider, runner, liveness).
 *
 * Used by the desktop local server. This ensures the background start and the
 * core application share the same liveness view for conflict detection.
 *
 * Import has no side effects until called (config load happens inside).
 */
export async function createConfiguredDesktopServices(): Promise<ConfiguredDesktopServices> {
  const config = await loadConfig();
  const taskService = new TaskService(config, { readFailureMode: 'strict' });
  const livenessService = new TaskRunnerLivenessService();
  const runner = new ReviewLoopRunner({
    config,
    taskService,
    onBackgroundError: () => undefined,
    formatFailure: (_error, neutralMessage) => neutralMessage,
  });

  const startService = new TaskStartService({
    taskService,
    runner,
    livenessService,
  });

  const application = createTaskManagerApplication({
    taskProvider: taskService,
    startTask: async input => {
      assertRuntimeConfig(config);
      return startService.startTask(input);
    },
  });

  const backgroundStart = new BackgroundStartService({
    taskProvider: taskService,
    runner,
    livenessService,
  });

  const trace = new TaskTraceService({
    taskProvider: taskService,
  });

  return {
    application,
    backgroundStart,
    workspace: buildDesktopWorkspaceSnapshot(config),
    trace,
  };
}

export function buildDesktopWorkspaceSnapshot(config: AppConfig): DesktopWorkspaceSnapshot {
  const sources = [
    ...(config.feishu ? ['feishu'] : []),
    ...(config.githubIssues
      ? normalizeGitHubRepos(config.githubIssues).map(repo => githubSource(repo.owner, repo.repo))
      : []),
  ];

  const agents = Object.keys(config.agents);
  const preferred =
    config.agents.claude ??
    config.agents.codex ??
    config.agents.coco ??
    config.agents.glm ??
    undefined;

  return {
    projects: Object.values(config.projects).map(project => ({
      key: project.key,
      name: project.name,
      defaultRepository: project.defaultRepository,
    })),
    repositories: Object.values(config.repositories).map(repository => ({
      key: repository.key,
      defaultBranch: repository.defaultBranch,
      workspaceStrategy: repository.workspaceStrategy,
    })),
    sources,
    agents,
    ...(preferred
      ? {
          chatAgent: {
            name: preferred.name,
            command: preferred.command,
            args: preferred.args,
            env: preferred.env,
          },
        }
      : {}),
  };
}
