import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { assertRuntimeConfig } from '../config/runtime-guard';
import { CompleteService } from '../services/complete-service';
import { GitHubPullRequestService } from '../services/github-pull-request-service';
import { GitPublishService } from '../services/git-publish-service';
import { PublishContextService } from '../services/publish-context-service';
import { buildCommitPrompt, buildPullRequestPrompt } from '../services/publish-prompt-service';
import { runStructuredAi, stripCodeFences } from '../services/structured-ai-service';
import { TaskService } from '../services/task-service';
import { printCommandOutput } from './command-output';

const commitMessageSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: { type: 'string' },
  },
  required: ['message'],
} as const;

const pullRequestContentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['title', 'body'],
} as const;

export const completeCommand = defineCommand({
  meta: {
    name: 'complete',
    description: 'Finalize a 待验收 task by committing, pushing, and creating a pull request',
  },
  args: {
    task: {
      type: 'string',
      required: true,
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
    const taskService = new TaskService(config);
    const service = new CompleteService({
      config,
      taskService,
      publishContextService: new PublishContextService(),
      gitPublishService: new GitPublishService(),
      pullRequestService: new GitHubPullRequestService(),
      generateCommitMessage: async input => {
        const generated = await runStructuredAi<{ message: string }>({
          cwd: input.workspacePath,
          prompt: buildCommitPrompt(input),
          sessionName: `${String(args.task).toLowerCase()}-publish-commit-claude`,
          command: config.agents.claude.command,
          args: config.agents.claude.args,
          env: config.agents.claude.env,
          schema: commitMessageSchema,
        });

        return {
          message: stripCodeFences(generated.data.message),
          sessionId: generated.sessionId,
          sessionName: generated.sessionName,
        };
      },
      generatePullRequestContent: async input => {
        const generated = await runStructuredAi<{ title: string; body: string }>({
          cwd: input.workspacePath,
          prompt: buildPullRequestPrompt(input),
          sessionName: `${String(args.task).toLowerCase()}-publish-pr-claude`,
          command: config.agents.claude.command,
          args: config.agents.claude.args,
          env: config.agents.claude.env,
          schema: pullRequestContentSchema,
        });

        return {
          title: generated.data.title,
          body: generated.data.body,
          sessionId: generated.sessionId,
          sessionName: generated.sessionName,
        };
      },
    });

    const result = await service.complete({ taskId: String(args.task) });
    const output = {
      taskId: String(args.task),
      branch: result.branch,
      commit: result.commit,
      pullRequestUrl: result.pullRequestUrl,
      status: '已完成',
    };

    printCommandOutput({
      json: Boolean(args.json),
      jsonValue: output,
      textLines: [
        `Task: ${String(args.task)}`,
        `Branch: ${result.branch}`,
        `Commit: ${result.commit}`,
        `PullRequest: ${result.pullRequestUrl}`,
        `Status: ${output.status}`,
      ],
    });
  },
});
