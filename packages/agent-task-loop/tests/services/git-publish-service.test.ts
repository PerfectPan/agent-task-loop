import { describe, expect, it, vi } from 'vitest';
import { GitPublishService } from '../../src/services/git-publish-service';

describe('GitPublishService', () => {
  it('creates a commit when workspace has dirty changes', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: ' M setup.sh' })
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: '[task/task-301-claude abc123] fix: publish flow' });

    const service = new GitPublishService(exec as never);
    await service.commitAll({
      workspacePath: '/tmp/worktree',
      message: 'fix: publish flow',
    });

    expect(exec).toHaveBeenCalledWith('git', ['-C', '/tmp/worktree', 'add', '-A']);
    expect(exec).toHaveBeenCalledWith(
      'git',
      ['-C', '/tmp/worktree', 'commit', '-F', expect.stringContaining('COMMIT_EDITMSG')],
    );
  });

  it('skips commit when workspace is clean', async () => {
    const exec = vi.fn().mockResolvedValueOnce({ stdout: '' });
    const service = new GitPublishService(exec as never);

    await service.commitAll({
      workspacePath: '/tmp/worktree',
      message: 'fix: publish flow',
    });

    expect(exec).toHaveBeenCalledTimes(1);
  });
});
