import { loadConfig } from '../config/load-config';
import { assertRuntimeConfig } from '../config/runtime-guard';
import { ReviewLoopRunner } from '../services/review-loop-runner';
import { TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
import { TaskService } from '../services/task-service';
import { BackgroundStartService } from './background-start';
import {
  createTaskManagerApplication,
  type TaskManagerApplication,
} from './task-manager-application';
import { TaskStartService } from './task-start-service';

export interface ConfiguredDesktopServices {
  application: TaskManagerApplication;
  backgroundStart: BackgroundStartService;
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

  return { application, backgroundStart };
}
