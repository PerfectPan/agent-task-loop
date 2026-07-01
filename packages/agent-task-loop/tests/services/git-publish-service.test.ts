import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { describe, expect, it, vi } from 'vitest';
import { GitPublishService } from '../../src/services/git-publish-service';

describe('GitPublishService', () => {
  it('creates a commit when workspace has dirty changes', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: ' M setup.sh' })
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: '[task/task-301-claude abc123] fix: publish flow' });

    const service = new GitPublishService(exec as never);
    await service.commitAll({
      workspacePath: '/tmp/worktree',
      message: 'fix: publish flow',
    });

    expect(exec).toHaveBeenCalledWith('git', ['-C', '/tmp/worktree', 'add', '-A']);
    expect(exec).toHaveBeenCalledWith('git', ['-C', '/tmp/worktree', 'reset', '--', '.agent-task-loop']);
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

  it('never stages .agent-task-loop/ even when the target repo has no matching .gitignore rule', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'atl-git-publish-'));
    try {
      await execa('git', ['-C', dir, 'init', '-q']);
      await execa('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
      await execa('git', ['-C', dir, 'config', 'user.name', 'Test']);

      mkdirSync(path.join(dir, '.agent-task-loop', 'logs'), { recursive: true });
      writeFileSync(path.join(dir, '.agent-task-loop', 'logs', 'run.log'), `/Users/someone/workspace/${dir}\n`);
      writeFileSync(path.join(dir, 'README.md'), 'real change\n');

      const service = new GitPublishService();
      await service.commitAll({ workspacePath: dir, message: 'fix: real change' });

      const tracked = await execa('git', ['-C', dir, 'ls-files']);
      expect(tracked.stdout.split('\n')).toEqual(['README.md']);

      const status = await execa('git', ['-C', dir, 'status', '--short']);
      expect(status.stdout).toContain('.agent-task-loop/');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('commits cleanly when the target repo already .gitignores .agent-task-loop/', async () => {
    // Regression: a bare pathspec exclusion (`-- . ':!.agent-task-loop'`) makes
    // git treat an *already-ignored* path as "you explicitly asked to add an
    // ignored path" and exit non-zero ("paths are ignored by one of your
    // .gitignore files") — which broke `complete` outright on this repo once
    // its own root .gitignore picked up the `.agent-task-loop/` rule.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'atl-git-publish-'));
    try {
      await execa('git', ['-C', dir, 'init', '-q']);
      await execa('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
      await execa('git', ['-C', dir, 'config', 'user.name', 'Test']);
      writeFileSync(path.join(dir, '.gitignore'), '.agent-task-loop/\n');
      await execa('git', ['-C', dir, 'add', '.gitignore']);
      await execa('git', ['-C', dir, 'commit', '-q', '-m', 'init']);

      mkdirSync(path.join(dir, '.agent-task-loop', 'logs'), { recursive: true });
      writeFileSync(path.join(dir, '.agent-task-loop', 'logs', 'run.log'), 'log\n');
      writeFileSync(path.join(dir, 'README.md'), 'real change\n');

      const service = new GitPublishService();
      await expect(service.commitAll({ workspacePath: dir, message: 'fix: real change' })).resolves.not.toThrow();

      const tracked = await execa('git', ['-C', dir, 'ls-files']);
      expect(tracked.stdout.split('\n').sort()).toEqual(['.gitignore', 'README.md']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
