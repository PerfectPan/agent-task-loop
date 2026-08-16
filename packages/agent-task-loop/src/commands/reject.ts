import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertRuntimeConfig } from '../config/runtime-guard';
import { runWithOccupancy } from '../orchestration/run-with-occupancy';
import { getSharedTaskOrchestration, taskOrchestrationKey } from '../orchestration/task-orchestration';
import { RejectService } from '../services/reject-service';
import { ReviewLoopRunner } from '../services/review-loop-runner';
import { TaskRunnerLivenessService } from '../services/task-runner-liveness-service';
import { TaskService } from '../services/task-service';

export const rejectCommand = defineCommand({
  meta: {
    name: 'reject',
    description: 'Reject a 待验收 task and send it back into the fix loop',
  },
  args: {
    task: {
      type: 'string',
      required: true,
    },
    reason: {
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
  },
  async run({ args }) {
    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    assertRuntimeConfig(config);
    const reason = String(args.reason).trim();
    if (!reason) {
      throw new Error('Reject reason must not be empty');
    }

    const taskService = new TaskService(config);
    const orchestration = getSharedTaskOrchestration();
    const runner = new ReviewLoopRunner({ config, taskService, orchestration });
    const livenessService = new TaskRunnerLivenessService();
    const configuredMaxRounds = Number(args.maxRounds ?? 5);
    const service = new RejectService({
      taskService,
      runLoop: input =>
        runWithOccupancy({
          orchestration,
          key: taskOrchestrationKey(input.task.taskId),
          taskId: input.task.taskId,
          bind: {
            impl: { cmd: input.task.targetAgent },
            review: { cmd: 'codex' },
          },
          goal: input.task.title || input.task.description,
          ref: { taskId: input.task.taskId },
          inspect: () => livenessService.inspect(input.task),
          award: 'impl',
          fn: () =>
            runner.run({
              ...input,
              maxRounds: Math.max(configuredMaxRounds, input.startRound + configuredMaxRounds - 1),
            }),
        }),
    });

    await service.reject({
      taskId: String(args.task),
      reason,
    });
    console.log(`Task: ${String(args.task)}`);
    console.log('Status: 修复中');
  },
});
