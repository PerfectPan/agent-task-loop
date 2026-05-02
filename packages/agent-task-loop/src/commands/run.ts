import { defineCommand } from 'citty';
import { claudeAdapter } from '../adapters/claude';
import { cocoAdapter } from '../adapters/coco';
import { codexAdapter } from '../adapters/codex';
import { glmAdapter } from '../adapters/glm';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import { ExecutionService } from '../services/execution-service';
import { resolveTaskExecutionContext } from '../services/task-context-service';
import { buildTaskPrompt } from '../services/prompt-service';
import { ensureWorkspace } from '../services/workspace-service';
import { TaskService } from '../services/task-service';
import type { TargetAgent } from '../types/task';
import { pickNextTask } from '../utils/priority';

const adapters = {
  claude: claudeAdapter,
  codex: codexAdapter,
  coco: cocoAdapter,
  glm: glmAdapter,
};

export const runCommand = defineCommand({
  meta: {
    name: 'run',
    description: 'Run one assigned task',
  },
  args: {
    agent: {
      type: 'string',
      required: true,
    },
    task: {
      type: 'string',
      required: false,
    },
    config: {
      type: 'string',
    },
  },
  async run({ args }) {
    const agent = args.agent as TargetAgent;
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertFeishuRuntimeConfig(config);
    const taskService = new TaskService(config);
    const tasks = await taskService.listPendingTasks(agent);
    const task = args.task
      ? tasks.find(item => item.taskId === String(args.task))
      : pickNextTask(tasks);

    if (!task) {
      console.log(`No pending task for agent ${agent}`);
      return;
    }

    const { project, repositoryKey, repository } = resolveTaskExecutionContext(config, task);
    const workspacePath = await ensureWorkspace({
      workspaceRoot: project.workspaceRoot,
      taskId: task.taskId,
      agent,
      existingWorkspacePath: task.workspacePath,
      strategy: repository.workspaceStrategy,
      repositoryPath: repository.localPath,
      defaultBranch: repository.defaultBranch,
    });
    const prompt = buildTaskPrompt({
      task,
      projectName: project.name,
      repositoryKey,
      workspacePath,
      taskTemplatePrompt: project.taskTemplatePrompt,
    });

    const executionService = new ExecutionService({
      taskService,
      adapter: adapters[agent],
      adapterCommand: {
        ...config.agents[agent],
        cwd: workspacePath,
        prompt,
      },
    });

    const execution = await executionService.executeTask(task, workspacePath);
    console.log(`Executed task ${task.taskId} log=${execution.logPath}`);
  },
});
