import { loadConfig } from '../config/load-config';
import { assertRuntimeConfig } from '../config/runtime-guard';
import { ReviewLoopRunner } from '../services/review-loop-runner';
import { TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
import { TaskService } from '../services/task-service';
import {
  createTaskManagerApplication,
  type TaskManagerApplication,
} from './task-manager-application';
import { TaskStartService } from './task-start-service';

export async function createConfiguredTaskManagerApplication(): Promise<TaskManagerApplication> {
  const config = await loadConfig();
  const taskService = new TaskService(config, { readFailureMode: 'strict' });
  const startService = new TaskStartService({
    taskService,
    runner: new ReviewLoopRunner({
      config,
      taskService,
      onBackgroundError: () => undefined,
      formatFailure: (_error, neutralMessage) => neutralMessage,
    }),
    livenessService: new TaskRunnerLivenessService(),
  });

  return createTaskManagerApplication({
    taskProvider: taskService,
    startTask: async input => {
      assertRuntimeConfig(config);
      return startService.startTask(input);
    },
  });
}
