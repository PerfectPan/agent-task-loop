import type { AppConfig } from '../config/schema';
import type { TaskService } from './task-service';
import type { PublishContextService } from './publish-context-service';
import type { GitPublishService } from './git-publish-service';
import type { GitHubPullRequestService } from './github-pull-request-service';
import { resolveTaskExecutionContext } from './task-context-service';
import { appendSessionHistory, formatSessionHistoryEntry } from './session-history';

export interface GeneratedCommitMessage {
  message: string;
  sessionId?: string;
  sessionName?: string;
}

export interface GeneratedPullRequestContent {
  title: string;
  body: string;
  sessionId?: string;
  sessionName?: string;
}

const PROCESS_SUMMARY_START = '<!-- agent-task-loop:process-summary:start -->';
const PROCESS_SUMMARY_END = '<!-- agent-task-loop:process-summary:end -->';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatProcessSummarySection(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error('generated pull request description is empty');
  }

  return `${PROCESS_SUMMARY_START}\n${trimmed}\n${PROCESS_SUMMARY_END}`;
}

function mergeProcessSummaryDescription(existingDescription: string | undefined, generatedBody: string): string {
  const trimmedGeneratedBody = generatedBody.trim();
  const nextSection = formatProcessSummarySection(trimmedGeneratedBody);
  const existing = existingDescription?.trim() ?? '';

  if (!existing) {
    return nextSection;
  }

  if (existing.includes(trimmedGeneratedBody)) {
    return existing;
  }

  const sectionPattern = new RegExp(
    `${escapeRegExp(PROCESS_SUMMARY_START)}[\\s\\S]*?${escapeRegExp(PROCESS_SUMMARY_END)}`,
  );

  if (sectionPattern.test(existing)) {
    return existing.replace(sectionPattern, nextSection);
  }

  return `${existing}\n\n${nextSection}`;
}

function warnIfProcessSummaryMissing(description: string | undefined, generatedBody: string): void {
  // The pull request already exists and was updated by this point — a missing
  // process-summary section is cosmetic and must NOT wedge the task (leaving a
  // dangling open PR with the task stuck pre-已完成). Warn and continue.
  if (!description?.includes(generatedBody.trim())) {
    console.warn(
      '[agent-task-loop] pull request description may not include the generated process summary; ' +
        'the PR was created/updated regardless.',
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CompleteService {
  constructor(
    private readonly deps: {
      config: AppConfig;
      taskService: Pick<TaskService, 'getTaskById' | 'updatePublishResult' | 'updateReviewState'>;
      publishContextService: PublishContextService;
      gitPublishService: GitPublishService;
      pullRequestService: GitHubPullRequestService;
      generateCommitMessage: (input: {
        taskTitle: string;
        taskDescription: string;
        resultSummary?: string;
        sessionHistory?: string;
        diffStat?: string;
        diff?: string;
        workspacePath: string;
      }) => Promise<GeneratedCommitMessage>;
      generatePullRequestContent: (input: {
        taskTitle: string;
        taskDescription: string;
        resultSummary?: string;
        sessionHistory?: string;
        commitSummary: string;
        workspacePath: string;
      }) => Promise<GeneratedPullRequestContent>;
    },
  ) {}

  async complete(input: { taskId: string }): Promise<{ branch: string; commit: string; pullRequestUrl: string }> {
    const task = await this.deps.taskService.getTaskById(input.taskId);
    if (!task) {
      throw new Error(`Task ${input.taskId} not found`);
    }
    if (task.status !== '待验收' && task.status !== '待发布') {
      throw new Error(`Task ${task.taskId} is not ready to publish: ${task.status}`);
    }
    if (!task.workspacePath) {
      throw new Error(`Task ${task.taskId} has no workspacePath`);
    }
    const { repository } = resolveTaskExecutionContext(this.deps.config, task);

    let context = await this.deps.publishContextService.load(task.workspacePath);
    if (context.branch === repository.defaultBranch) {
      // Same guard AutoPublishService has: never push/PR the default branch into
      // itself (happens with workspaceStrategy 'existing-repo' on the base branch).
      throw new Error(
        `Task ${task.taskId} workspace is on the default branch (${repository.defaultBranch}); ` +
          `refusing to open a pull request from it into itself.`,
      );
    }
    let sessionHistory = task.sessionHistory;

    if (context.isDirty) {
      const generatedCommit = await this.deps.generateCommitMessage({
        taskTitle: task.title,
        taskDescription: task.description,
        resultSummary: task.resultSummary,
        sessionHistory,
        diffStat: context.diffStat,
        diff: context.diff,
        workspacePath: task.workspacePath,
      });

      sessionHistory = appendSessionHistory(
        sessionHistory,
        formatSessionHistoryEntry({
          kind: 'publish-commit',
          round: task.reviewRound ?? 0,
          agent: 'codex',
          sessionName: generatedCommit.sessionName,
          sessionId: generatedCommit.sessionId,
          workspacePath: task.workspacePath,
        }),
      );
      task.sessionHistory = sessionHistory;

      await this.deps.taskService.updatePublishResult(task, {
        progressSummary: 'AI 正在整理 commit 信息并提交代码',
        sessionHistory,
      });

      await this.deps.gitPublishService.commitAll({
        workspacePath: task.workspacePath,
        message: generatedCommit.message,
      });
      context = await this.deps.publishContextService.load(task.workspacePath);
    }

    await this.deps.taskService.updatePublishResult(task, {
      progressSummary: '正在推送远端分支',
      sessionHistory,
    });

    try {
      await this.deps.gitPublishService.pushBranch({
        workspacePath: task.workspacePath,
        branch: context.branch,
      });

      const remoteHead = await this.deps.gitPublishService.getRemoteBranchHead({
        workspacePath: task.workspacePath,
        branch: context.branch,
      });

      if (!remoteHead || remoteHead !== context.headCommit) {
        throw new Error(`push verification failed for branch ${context.branch}`);
      }
    } catch (error) {
      await this.deps.taskService.updatePublishResult(task, {
        progressSummary: '推送远端分支失败，请查看 LastError',
        sessionHistory,
        lastError: errorMessage(error),
      });
      throw error;
    }

    await this.deps.taskService.updatePublishResult(task, {
      publishBranch: context.branch,
      publishCommit: context.headCommit,
      progressSummary: '远端分支已推送，正在创建或复用 Pull Request',
      resultSummary: task.resultSummary,
      sessionHistory,
      lastError: '',
    });

    const existingPullRequest = await this.deps.pullRequestService.findOpenPullRequestByBranch({ branch: context.branch });

    const generatedPullRequest = await this.generatePullRequestContentWithHistory({
      workspacePath: task.workspacePath,
      task,
      sessionHistory,
      commitSummary: context.headCommit,
      sourceBranch: context.branch,
    });
    sessionHistory = generatedPullRequest.sessionHistory;
    task.sessionHistory = sessionHistory;

    const pullRequest =
      existingPullRequest ??
      (await this.deps.pullRequestService.createReadyPullRequest({
        sourceBranch: context.branch,
        targetBranch: repository.defaultBranch,
        title: generatedPullRequest.title,
        description: generatedPullRequest.body,
      }));
    const pullRequestDetail =
      typeof pullRequest.description === 'string' ? pullRequest : await this.deps.pullRequestService.getPullRequest({ number: pullRequest.number });
    const nextPullRequestDescription = mergeProcessSummaryDescription(pullRequestDetail.description, generatedPullRequest.body);
    await this.deps.taskService.updatePublishResult(task, {
      prLink: pullRequest.url,
      publishBranch: context.branch,
      publishCommit: context.headCommit,
      progressSummary: '正在更新 Pull Request 描述',
      resultSummary: task.resultSummary,
      sessionHistory,
    });
    const updatedPullRequest = await this.deps.pullRequestService.updatePullRequest({
      number: pullRequest.number,
      description: nextPullRequestDescription,
    });
    const updatedDescription =
      updatedPullRequest.description ??
      (await this.deps.pullRequestService.getPullRequest({ number: pullRequest.number })).description;
    warnIfProcessSummaryMissing(updatedDescription, generatedPullRequest.body);

    const publishedAt = new Date().toISOString();
    await this.deps.taskService.updatePublishResult(task, {
      prLink: updatedPullRequest.url,
      publishBranch: context.branch,
      publishCommit: context.headCommit,
      publishedAt,
      progressSummary: 'Pull Request 已创建，任务完成',
      resultSummary: task.resultSummary,
      sessionHistory,
    });
    await this.deps.taskService.updateReviewState(task, {
      status: '已完成',
      currentOwner: '董事长',
      acceptanceRound: task.acceptanceRound ?? 1,
      acceptanceVerdict: '通过',
      progressSummary: 'Pull Request 已创建，任务完成',
      sessionHistory,
    });

    return {
      branch: context.branch,
      commit: context.headCommit,
      pullRequestUrl: updatedPullRequest.url,
    };
  }

  private async generatePullRequestContentWithHistory(input: {
    workspacePath: string;
    task: NonNullable<Awaited<ReturnType<TaskService['getTaskById']>>>;
    sessionHistory: string | undefined;
    commitSummary: string;
    sourceBranch: string;
  }): Promise<GeneratedPullRequestContent & { sessionHistory: string }> {
    const generatedPullRequest = await this.deps.generatePullRequestContent({
      taskTitle: input.task.title,
      taskDescription: input.task.description,
      resultSummary: input.task.resultSummary,
      sessionHistory: input.sessionHistory,
      commitSummary: input.commitSummary,
      workspacePath: input.workspacePath,
    });

    const nextSessionHistory = appendSessionHistory(
      input.sessionHistory,
      formatSessionHistoryEntry({
        kind: 'publish-pr',
        round: input.task.reviewRound ?? 0,
        agent: 'codex',
        sessionName: generatedPullRequest.sessionName,
        sessionId: generatedPullRequest.sessionId,
        workspacePath: input.workspacePath,
      }),
    );

    await this.deps.taskService.updatePublishResult(input.task, {
      publishBranch: input.sourceBranch,
      publishCommit: input.commitSummary,
      progressSummary: 'AI 正在生成 Pull Request 标题和正文',
      sessionHistory: nextSessionHistory,
    });

    return {
      ...generatedPullRequest,
      sessionHistory: nextSessionHistory,
    };
  }
}
