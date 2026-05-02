import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { AutoPublishService } from '../../src/services/auto-publish-service';

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
      defaultBranch: 'master',
      installCommand: 'rush update',
      testCommand: 'rush test',
      buildCommand: 'rush build',
      workspaceStrategy: 'worktree',
    },
  },
  agents: {},
} as unknown as AppConfig;

describe('AutoPublishService', () => {
  it('commits dirty changes, pushes branch and verifies remote commit', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        branch: 'task/task-301-claude',
        headCommit: 'abc000',
        isDirty: true,
        diffStat: ' file.ts | 2 +-',
        diff: 'diff --git a/file.ts b/file.ts',
        status: ' M file.ts',
        workspacePath: '/tmp/worktree',
      })
      .mockResolvedValueOnce({
        branch: 'task/task-301-claude',
        headCommit: 'abc123',
        isDirty: false,
        diffStat: '',
        diff: '',
        status: '',
        workspacePath: '/tmp/worktree',
      });
    const commitAll = vi.fn();
    const pushBranch = vi.fn();
    const getRemoteBranchHead = vi.fn().mockResolvedValue('abc123');

    const service = new AutoPublishService({
      config,
      publishContextService: { load } as never,
      gitPublishService: { commitAll, pushBranch, getRemoteBranchHead } as never,
      generateCommitMessage: vi.fn().mockResolvedValue('fix: 切换租户登出问题 (TASK-102)'),
    });

    const result = await service.publish(
      {
        taskId: 'TASK-102',
        title: '切换租户登出问题',
        description: 'desc',
        project: 'demo',
        repository: 'demo',
        targetAgent: 'claude',
        priority: 1,
        status: '待复核',
        resultSummary: 'done',
      } as never,
      '/tmp/worktree',
    );

    expect(commitAll).toHaveBeenCalledWith({
      workspacePath: '/tmp/worktree',
      message: 'fix: 切换租户登出问题 (TASK-102)',
    });
    expect(pushBranch).toHaveBeenCalledWith({
      workspacePath: '/tmp/worktree',
      branch: 'task/task-301-claude',
    });
    expect(getRemoteBranchHead).toHaveBeenCalledWith({
      workspacePath: '/tmp/worktree',
      branch: 'task/task-301-claude',
    });
    expect(result).toEqual({
      branch: 'task/task-301-claude',
      commit: 'abc123',
    });
  });

  it('refuses to publish from the repository default branch', async () => {
    const load = vi.fn().mockResolvedValue({
      branch: 'master',
      headCommit: 'abc123',
      isDirty: false,
      diffStat: '',
      diff: '',
      status: '',
      workspacePath: '/tmp/worktree',
    });

    const service = new AutoPublishService({
      config,
      publishContextService: { load } as never,
      gitPublishService: {
        commitAll: vi.fn(),
        pushBranch: vi.fn(),
        getRemoteBranchHead: vi.fn(),
      } as never,
      generateCommitMessage: vi.fn(),
    });

    await expect(
      service.publish(
        {
          taskId: 'TASK-302',
          title: '禁止直接在主干发布',
          description: 'desc',
          project: 'demo',
          repository: 'demo',
          targetAgent: 'claude',
          priority: 1,
          status: '待复核',
        } as never,
        '/tmp/worktree',
      ),
    ).rejects.toThrow('refusing to use default branch master as task publish branch');
  });
});
