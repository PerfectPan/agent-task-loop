import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertRuntimeConfig } from '../config/runtime-guard';
import { CleanupService } from '../services/cleanup-service';
import { PublishContextService } from '../services/publish-context-service';
import { TaskService } from '../services/task-service';
import { printCommandOutput } from './command-output';

export const cleanupCommand = defineCommand({
  meta: {
    name: 'cleanup',
    description: 'Remove a completed task worktree and clear its workspace metadata',
  },
  args: {
    task: {
      type: 'string',
      required: true,
    },
    force: {
      type: 'boolean',
      default: false,
    },
    config: {
      type: 'string',
    },
    json: {
      type: 'boolean',
      default: false,
    },
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertRuntimeConfig(config);

    const service = new CleanupService({
      config,
      taskService: new TaskService(config),
      publishContextService: new PublishContextService(),
    });

    const result = await service.cleanup({ taskId: String(args.task), force: Boolean(args.force) });
    const status = args.force ? '已强制清理工作区' : '已清理工作区';

    printCommandOutput({
      json: Boolean(args.json),
      jsonValue: {
        taskId: String(args.task),
        branch: result.branch,
        workspacePath: result.workspacePath,
        status,
      },
      textLines: [
        `Task: ${String(args.task)}`,
        `Branch: ${result.branch}`,
        `Workspace removed: ${result.workspacePath}`,
        `Status: ${status}`,
      ],
    });
  },
});
