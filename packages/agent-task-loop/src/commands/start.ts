import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertRuntimeConfig } from '../config/runtime-guard';
import { ReviewLoopRunner } from '../services/review-loop-runner';
import { TaskService } from '../services/task-service';
import { TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
import { TaskStartService } from '../task-manager/task-start-service';
import { TARGET_AGENTS, type TargetAgent } from '../types/task';

export const startCommand = defineCommand({
  meta: {
    name: 'start',
    description: 'Start the full execute-review loop for one task',
  },
  args: {
    task: {
      type: 'string',
      required: true,
    },
    config: {
      type: 'string',
    },
    maxRounds: {
      type: 'string',
      default: '5',
    },
    agent: {
      type: 'string',
    },
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertRuntimeConfig(config);
    const taskService = new TaskService(config);
    let targetAgent: TargetAgent | undefined;
    if (typeof args.agent === 'string') {
      if (!TARGET_AGENTS.includes(args.agent as TargetAgent)) {
        throw new Error(`Unknown agent ${args.agent}`);
      }
      targetAgent = args.agent as TargetAgent;
    }

    const runner = new ReviewLoopRunner({ config, taskService });
    const startService = new TaskStartService({
      taskService,
      runner,
      livenessService: new TaskRunnerLivenessService(),
      onRecovery: inspection => {
        console.log(`[agent-task-loop] 检测到僵死 ${inspection.mode} 轮次，正在从当前现场恢复：${inspection.reason ?? 'unknown'}`);
      },
    });
    const task = await startService.startTask({
      taskId: String(args.task),
      maxRounds: Number(args.maxRounds),
      ...(targetAgent ? { targetAgent } : {}),
    });
    console.log(`Completed review loop for task ${task.taskId}`);
  },
});
