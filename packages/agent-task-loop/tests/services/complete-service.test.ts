import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { CompleteService } from '../../src/services/complete-service';

const config = {
  feishu: { baseToken: 'base', tableId: 'table' },
  projects: {
    demo: {
      key: 'demo',
      name: 'Demo',
      defaultRepository: 'demo',
      workspaceRoot: '/tmp/worktrees',
      taskTemplatePrompt: '',
    },
  },
  repositories: {
    demo: {
      key: 'demo',
      localPath: '/tmp/demo',
      defaultBranch: 'main',
      installCommand: 'pnpm install',
      testCommand: 'pnpm test',
      buildCommand: 'pnpm build',
      workspaceStrategy: 'worktree',
    },
  },
  agents: {},
} as unknown as AppConfig;

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'TASK-301',
    title: 'publish',
    description: 'desc',
    status: '待发布',
    workspacePath: '/tmp/worktree',
    resultSummary: 'done',
    sessionHistory: 'round=1 execute',
    project: 'demo',
    repository: 'demo',
    targetAgent: 'claude',
    priority: 1,
    ...overrides,
  };
}

function createService(input: {
  task?: Record<string, unknown>;
  publishContextService?: Record<string, unknown>;
  gitPublishService?: Record<string, unknown>;
  pullRequestService?: Record<string, unknown>;
  generateCommitMessage?: ReturnType<typeof vi.fn>;
  generatePullRequestContent?: ReturnType<typeof vi.fn>;
}) {
  const taskService = {
    getTaskById: vi.fn().mockResolvedValue(createTask(input.task)),
    updatePublishResult: vi.fn(),
    updateReviewState: vi.fn(),
  };

  const service = new CompleteService({
    config,
    taskService: taskService as never,
    publishContextService: {
      load: vi.fn().mockResolvedValue({
        branch: 'task/demo-301',
        headCommit: 'abc123',
        isDirty: false,
        diffStat: '',
        diff: '',
        status: '',
        workspacePath: '/tmp/worktree',
      }),
      ...input.publishContextService,
    } as never,
    gitPublishService: {
      commitAll: vi.fn(),
      pushBranch: vi.fn(),
      getRemoteBranchHead: vi.fn().mockResolvedValue('abc123'),
      ...input.gitPublishService,
    } as never,
    pullRequestService: {
      findOpenPullRequestByBranch: vi.fn().mockResolvedValue(undefined),
      createReadyPullRequest: vi.fn().mockResolvedValue({
        number: 12,
        url: 'https://github.com/acme/demo/pull/12',
        description: 'body',
      }),
      getPullRequest: vi.fn(),
      updatePullRequest: vi.fn().mockResolvedValue({
        number: 12,
        url: 'https://github.com/acme/demo/pull/12',
        description: 'body',
      }),
      ...input.pullRequestService,
    } as never,
    generateCommitMessage:
      input.generateCommitMessage ??
      vi.fn().mockResolvedValue({
        message: 'fix: publish flow',
        sessionId: 'publish-commit-1',
        sessionName: 'task-301-publish-commit-codex',
      }),
    generatePullRequestContent:
      input.generatePullRequestContent ??
      vi.fn().mockResolvedValue({
        title: 'fix: publish flow',
        body: 'body',
        sessionId: 'publish-pr-1',
        sessionName: 'task-301-publish-pr-codex',
      }),
  });

  return { service, taskService };
}

describe('CompleteService', () => {
  it('marks a 待发布 task as 已完成 after verified push and pull request creation', async () => {
    const { service, taskService } = createService({
      publishContextService: {
        load: vi
          .fn()
          .mockResolvedValueOnce({
            branch: 'task/demo-301',
            headCommit: 'abc000',
            isDirty: true,
            diffStat: ' setup.sh | 2 ++',
            diff: 'diff --git a/setup.sh b/setup.sh',
            status: ' M setup.sh',
            workspacePath: '/tmp/worktree',
          })
          .mockResolvedValueOnce({
            branch: 'task/demo-301',
            headCommit: 'abc123',
            isDirty: false,
            diffStat: '',
            diff: '',
            status: '',
            workspacePath: '/tmp/worktree',
          }),
      },
    });

    const result = await service.complete({ taskId: 'TASK-301' });

    expect(taskService.updateReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-301' }),
      expect.objectContaining({
        status: '已完成',
        progressSummary: 'Pull Request 已创建，任务完成',
      }),
    );
    expect(taskService.updatePublishResult).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-301' }),
      expect.objectContaining({
        prLink: 'https://github.com/acme/demo/pull/12',
        publishBranch: 'task/demo-301',
        publishCommit: 'abc123',
        progressSummary: 'Pull Request 已创建，任务完成',
      }),
    );
    expect(result).toEqual({
      branch: 'task/demo-301',
      commit: 'abc123',
      pullRequestUrl: 'https://github.com/acme/demo/pull/12',
    });
  });

  it('does not write publishCommit when push fails', async () => {
    const { service, taskService } = createService({
      task: { taskId: 'TASK-306' },
      gitPublishService: {
        pushBranch: vi.fn().mockRejectedValue(new Error('push failed')),
        getRemoteBranchHead: vi.fn(),
      },
    });

    await expect(service.complete({ taskId: 'TASK-306' })).rejects.toThrow('push failed');

    const publishPayloads = taskService.updatePublishResult.mock.calls.map(call => call[1]);
    expect(publishPayloads).toContainEqual(
      expect.objectContaining({
        progressSummary: '推送远端分支失败，请查看 LastError',
        lastError: 'push failed',
      }),
    );
    expect(publishPayloads.some(payload => payload.publishCommit)).toBe(false);
  });

  it('fails before completion when remote head does not match local commit', async () => {
    const { service, taskService } = createService({
      task: { taskId: 'TASK-307' },
      gitPublishService: {
        getRemoteBranchHead: vi.fn().mockResolvedValue('def456'),
      },
    });

    await expect(service.complete({ taskId: 'TASK-307' })).rejects.toThrow(
      'push verification failed for branch task/demo-301',
    );

    expect(taskService.updatePublishResult).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'TASK-307' }),
      expect.objectContaining({
        progressSummary: '推送远端分支失败，请查看 LastError',
        lastError: 'push verification failed for branch task/demo-301',
      }),
    );
  });

  it('keeps task at 待验收 when pull request creation fails', async () => {
    const { service, taskService } = createService({
      task: { taskId: 'TASK-302', status: '待验收' },
      pullRequestService: {
        createReadyPullRequest: vi.fn().mockRejectedValue(new Error('403 forbidden')),
      },
    });

    await expect(service.complete({ taskId: 'TASK-302' })).rejects.toThrow('403 forbidden');
    expect(taskService.updateReviewState).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: '已完成' }),
    );
  });

  it('preserves an existing pull request description when appending process summary', async () => {
    const updatePullRequest = vi.fn().mockImplementation(input =>
      Promise.resolve({
        number: 14,
        url: 'https://github.com/acme/demo/pull/14',
        description: input.description,
      }),
    );
    const { service } = createService({
      task: { taskId: 'TASK-304', status: '待验收' },
      pullRequestService: {
        findOpenPullRequestByBranch: vi.fn().mockResolvedValue({
          number: 14,
          url: 'https://github.com/acme/demo/pull/14',
        }),
        createReadyPullRequest: vi.fn(),
        getPullRequest: vi.fn().mockResolvedValue({
          number: 14,
          url: 'https://github.com/acme/demo/pull/14',
          description: 'existing pull request body',
        }),
        updatePullRequest,
      },
      generatePullRequestContent: vi.fn().mockResolvedValue({
        title: 'fix: publish flow',
        body: 'new process summary',
        sessionId: 'publish-pr-1',
        sessionName: 'task-304-publish-pr-codex',
      }),
    });

    await service.complete({ taskId: 'TASK-304' });

    expect(updatePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('existing pull request body'),
      }),
    );
    expect(updatePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('new process summary'),
      }),
    );
  });

  it('keeps task at 待验收 when pull request description update fails', async () => {
    const { service, taskService } = createService({
      task: { taskId: 'TASK-305', status: '待验收' },
      pullRequestService: {
        findOpenPullRequestByBranch: vi.fn().mockResolvedValue({
          number: 15,
          url: 'https://github.com/acme/demo/pull/15',
        }),
        getPullRequest: vi.fn().mockResolvedValue({
          number: 15,
          url: 'https://github.com/acme/demo/pull/15',
          description: 'existing body',
        }),
        updatePullRequest: vi.fn().mockRejectedValue(new Error('pull request update failed')),
      },
      generatePullRequestContent: vi.fn().mockResolvedValue({
        title: 'fix: publish flow',
        body: 'new process summary',
        sessionId: 'publish-pr-1',
        sessionName: 'task-305-publish-pr-codex',
      }),
    });

    await expect(service.complete({ taskId: 'TASK-305' })).rejects.toThrow('pull request update failed');
    expect(taskService.updateReviewState).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: '已完成' }),
    );
  });
});
