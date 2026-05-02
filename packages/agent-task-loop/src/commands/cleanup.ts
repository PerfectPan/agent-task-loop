import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import { CleanupService } from '../services/cleanup-service';
import { PublishContextService } from '../services/publish-context-service';
import { TaskService } from '../services/task-service';

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
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertFeishuRuntimeConfig(config);

    const service = new CleanupService({
      config,
      taskService: new TaskService(config),
      publishContextService: new PublishContextService(),
    });

    const result = await service.cleanup({ taskId: String(args.task), force: Boolean(args.force) });
    console.log(`Task: ${String(args.task)}`);
    console.log(`Branch: ${result.branch}`);
    console.log(`Workspace removed: ${result.workspacePath}`);
    console.log(`Status: ${args.force ? '已强制清理工作区' : '已清理工作区'}`);
  },
});
