import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import { ReviewLoopRunner } from '../services/review-loop-runner';
import { buildReworkPrompt } from '../services/rework-prompt-service';
import { TaskService } from '../services/task-service';
import { TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
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
    assertFeishuRuntimeConfig(config);
    const taskService = new TaskService(config);
    const task = await taskService.getTaskById(String(args.task));

    if (!task) {
      throw new Error(`Task ${String(args.task)} not found`);
    }

    if (typeof args.agent === 'string') {
      if (!TARGET_AGENTS.includes(args.agent as TargetAgent)) {
        throw new Error(`Unknown agent ${args.agent}`);
      }
      task.targetAgent = args.agent as TargetAgent;
      task.currentOwner = args.agent;
    }

    const runner = new ReviewLoopRunner({ config, taskService });
    const livenessService = new TaskRunnerLivenessService();
    const inspection = await livenessService.inspect(task);
    const configuredMaxRounds = Number(args.maxRounds);
    const maxRoundsForStartRound = (startRound?: number) =>
      startRound ? Math.max(configuredMaxRounds, startRound + configuredMaxRounds - 1) : configuredMaxRounds;

    if (inspection.state === 'active') {
      throw new Error(`Task ${task.taskId} already has an active ${inspection.mode} runner`);
    }

    if (inspection.state === 'stale') {
      console.log(`[agent-task-loop] 检测到僵死 ${inspection.mode} 轮次，正在从当前现场恢复：${inspection.reason ?? 'unknown'}`);
      if (inspection.mode === 'review') {
        await runner.resumeReview({
          task,
          maxRounds: maxRoundsForStartRound(inspection.round),
          round: inspection.round ?? task.reviewRound ?? 1,
          workspacePath: task.workspacePath ?? '',
          resultSummary: task.resultSummary,
        });
      } else {
        await runner.run({
          task,
          maxRounds: maxRoundsForStartRound(inspection.round),
          promptOverride: inspection.promptOverride,
          startRound: inspection.round,
        });
      }
    } else {
      const recoveryStartRound = task.status === '已失败' ? (task.reviewRound ?? 0) + 1 : undefined;
      await runner.run({
        task,
        maxRounds: maxRoundsForStartRound(recoveryStartRound),
        startRound: recoveryStartRound,
        promptOverride:
          recoveryStartRound ?
            buildReworkPrompt({
              taskDescription: task.description,
              resultSummary: task.resultSummary,
              reviewFindings: task.reviewFindings,
              acceptanceFeedback: task.acceptanceFeedback,
            })
          : undefined,
      });
    }
    console.log(`Completed review loop for task ${task.taskId}`);
  },
});
