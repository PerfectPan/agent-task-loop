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

  it('turns a non-fast-forward push rejection into actionable guidance', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('! [rejected] task/x -> task/x (non-fast-forward)\nUpdates were rejected'));
    const service = new GitPublishService(exec as never);

    await expect(service.pushBranch({ workspacePath: '/tmp/worktree', branch: 'task/x' })).rejects.toThrow(
      /diverged.*git push origin --delete task\/x/s,
    );
  });

  it('rethrows an unrelated push failure unchanged', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('fatal: could not read from remote'));
    const service = new GitPublishService(exec as never);

    await expect(service.pushBranch({ workspacePath: '/tmp/worktree', branch: 'task/x' })).rejects.toThrow(
      /could not read from remote/,
    );
  });
});
