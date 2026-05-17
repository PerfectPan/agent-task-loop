import { defineCommand } from 'citty';
import { execa } from 'execa';
import { loadConfig } from '../config/load-config';
import { assertFeishuRuntimeConfig } from '../config/runtime-guard';
import type { TaskRecord } from '../types/task';
import { CompleteService } from '../services/complete-service';
import { GitHubPullRequestService } from '../services/github-pull-request-service';
import { GitPublishService } from '../services/git-publish-service';
import { PublishContextService } from '../services/publish-context-service';
import { buildCommitPrompt, buildPullRequestPrompt } from '../services/publish-prompt-service';
import { TaskService } from '../services/task-service';
import { printJson } from './json-output';

interface ClaudeStructuredResult<T> {
  data: T;
  sessionId?: string;
  sessionName?: string;
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function extractClaudeStructured<T>(output: string): ClaudeStructuredResult<T> {
  let sessionId: string | undefined;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const event = JSON.parse(line) as Record<string, any>;

    if (event.type === 'system' && event.subtype === 'init' && typeof event.session_id === 'string') {
      sessionId = event.session_id;
      continue;
    }

    if (event.type === 'result' && event.is_error) {
      const errorText = typeof event.result === 'string' ? event.result : 'claude structured generation failed';
      throw new Error(errorText);
    }

    if (event.type === 'result' && event.structured_output) {
      return {
        data: event.structured_output as T,
        sessionId,
      };
    }
  }

  throw new Error(`Failed to parse structured Claude output: ${output}`);
}

async function runPublishAi<T>(input: {
  task: TaskRecord;
  workspacePath: string;
  prompt: string;
  sessionName: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  schema: Record<string, unknown>;
}): Promise<ClaudeStructuredResult<T>> {
  const result = await execa(
    input.command,
    [
      ...input.args,
      '-p',
      '-n',
      input.sessionName,
      '--output-format',
      'stream-json',
      '--verbose',
      '--json-schema',
      JSON.stringify(input.schema),
      '--tools',
      '',
      '--permission-mode',
      'bypassPermissions',
      input.prompt,
    ],
    {
      cwd: input.workspacePath,
      env: { ...process.env, ...input.env },
      reject: false,
      all: true,
      stdin: 'ignore',
      timeout: 120_000,
    },
  );

  if ((result.exitCode ?? 1) !== 0) {
    throw new Error(result.stderr || result.stdout || 'claude structured generation failed');
  }

  return {
    ...extractClaudeStructured<T>(result.all ?? result.stdout),
    sessionName: input.sessionName,
  };
}

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
    assertFeishuRuntimeConfig(config);
    const taskService = new TaskService(config);
    const service = new CompleteService({
      config,
      taskService,
      publishContextService: new PublishContextService(),
      gitPublishService: new GitPublishService(),
      pullRequestService: new GitHubPullRequestService(),
      generateCommitMessage: async input => {
        const generated = await runPublishAi<{ message: string }>({
          task: {
            taskId: String(args.task),
            title: input.taskTitle,
            description: input.taskDescription,
            project: 'publish',
            targetAgent: 'claude',
            priority: 0,
            status: '待验收',
          },
          workspacePath: input.workspacePath,
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
        const generated = await runPublishAi<{ title: string; body: string }>({
          task: {
            taskId: String(args.task),
            title: input.taskTitle,
            description: input.taskDescription,
            project: 'publish',
            targetAgent: 'claude',
            priority: 0,
            status: '待验收',
          },
          workspacePath: input.workspacePath,
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

    if (args.json) {
      printJson(output);
      return;
    }

    console.log(`Task: ${String(args.task)}`);
    console.log(`Branch: ${result.branch}`);
    console.log(`Commit: ${result.commit}`);
    console.log(`PullRequest: ${result.pullRequestUrl}`);
    console.log(`Status: ${output.status}`);
  },
});
