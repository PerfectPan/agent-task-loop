import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import { TaskService } from '../services/task-service';

export const resumeCommand = defineCommand({
  meta: {
    name: 'resume',
    description: 'Show execution and review session details for one task',
  },
  args: {
    task: {
      type: 'string',
      required: true,
    },
    config: {
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

    console.log(`Task: ${task.taskId}`);
    if (task.executionSessionName) {
      console.log(`ExecutionSessionName: ${task.executionSessionName}`);
    }
    if (task.executionSessionId) {
      console.log(`ExecutionSessionId: ${task.executionSessionId}`);
    }
    if (task.targetAgent === 'claude' && task.executionSessionId) {
      console.log(`ExecutionResume: claude --resume ${task.executionSessionId}`);
    }
    if (task.reviewSessionName) {
      console.log(`ReviewSessionName: ${task.reviewSessionName}`);
    }
    if (task.reviewSessionId) {
      console.log(`ReviewSessionId: ${task.reviewSessionId}`);
    }
    if (task.reviewSessionId) {
      console.log(`ReviewResume: codex resume ${task.reviewSessionId}`);
    }
    if (task.acceptanceRound !== undefined) {
      console.log(`AcceptanceRound: ${task.acceptanceRound}`);
    }
    if (task.acceptanceVerdict) {
      console.log(`AcceptanceVerdict: ${task.acceptanceVerdict}`);
    }
    if (task.acceptanceFeedback) {
      console.log(`AcceptanceFeedback: ${task.acceptanceFeedback}`);
    }
    if (task.publishBranch) {
      console.log(`PublishBranch: ${task.publishBranch}`);
    }
    if (task.publishCommit) {
      console.log(`PublishCommit: ${task.publishCommit}`);
    }
    if (task.publishedAt) {
      console.log(`PublishedAt: ${task.publishedAt}`);
    }
    if (task.prLink) {
      console.log(`PullRequestLink: ${task.prLink}`);
    }
    if (task.sessionHistory) {
      console.log('SessionHistory:');
      console.log(task.sessionHistory);
    }
    if (task.runnerKind) {
      console.log(`RunnerKind: ${task.runnerKind}`);
    }
    if (task.runnerAgent) {
      console.log(`RunnerAgent: ${task.runnerAgent}`);
    }
    if (task.runnerRound !== undefined) {
      console.log(`RunnerRound: ${task.runnerRound}`);
    }
    if (task.runnerPid !== undefined) {
      console.log(`RunnerPid: ${task.runnerPid}`);
    }
    if (task.lastHeartbeatAt) {
      console.log(`LastHeartbeatAt: ${task.lastHeartbeatAt}`);
    }
  },
});
