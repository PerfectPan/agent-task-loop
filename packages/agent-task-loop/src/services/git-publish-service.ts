import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';

type ExecLike = typeof execa;

export class GitPublishService {
  constructor(private readonly exec: ExecLike = execa) {}

  async commitAll(input: { workspacePath: string; message: string; signal?: AbortSignal }): Promise<void> {
    const status = await this.runGit(
      ['-C', input.workspacePath, 'status', '--short'],
      input.signal,
    );
    input.signal?.throwIfAborted();
    if (!status.stdout.trim()) {
      return;
    }

    // Exclude our own runtime bookkeeping dir regardless of the target repo's
    // .gitignore — agent-task-loop runs against arbitrary repos, and a leaked
    // .agent-task-loop/logs/*.log embeds local absolute paths in the commit.
    //
    // A pathspec exclusion (`-- . ':!.agent-task-loop'`) looks equivalent but
    // git treats an explicit pathspec referencing an *already-gitignored* path
    // as "you asked me to add an ignored path" and errors ("paths are ignored
    // by one of your .gitignore files") — which broke `complete` outright on
    // this very repo once its own .gitignore picked up the rule. `reset` after
    // a plain `add -A` has no such special case: it silently no-ops on a path
    // that was never staged (already ignored, or absent entirely).
    await this.runGit(['-C', input.workspacePath, 'add', '-A'], input.signal);
    input.signal?.throwIfAborted();
    await this.runGit(
      ['-C', input.workspacePath, 'reset', '--', '.agent-task-loop'],
      input.signal,
    );
    input.signal?.throwIfAborted();

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-commit-'));
    const messageFile = path.join(tempDir, 'COMMIT_EDITMSG');

    try {
      input.signal?.throwIfAborted();
      await writeFile(messageFile, `${input.message.trim()}\n`, 'utf8');
      input.signal?.throwIfAborted();
      await this.runGit(
        ['-C', input.workspacePath, 'commit', '-F', messageFile],
        input.signal,
      );
      input.signal?.throwIfAborted();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async pushBranch(input: { workspacePath: string; branch: string; signal?: AbortSignal }): Promise<void> {
    try {
      await this.runGit(
        ['-C', input.workspacePath, 'push', '-u', 'origin', input.branch],
        input.signal,
      );
      input.signal?.throwIfAborted();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/non-fast-forward|fetch first|\[rejected\]|stale info/i.test(message)) {
        throw new Error(
          `Pushing "${input.branch}" was rejected as non-fast-forward: the remote branch has diverged, ` +
            `usually a leftover branch from a previous run of this task. Delete the remote branch ` +
            `(\`git push origin --delete ${input.branch}\`) or rebase the worktree onto it, then retry.\n${message}`,
        );
      }
      throw error;
    }
  }

  async getRemoteBranchHead(input: {
    workspacePath: string;
    branch: string;
    signal?: AbortSignal;
  }): Promise<string | undefined> {
    const result = await this.runGit(
      ['-C', input.workspacePath, 'ls-remote', '--heads', 'origin', input.branch],
      input.signal,
    );
    input.signal?.throwIfAborted();
    const line = result.stdout.trim().split('\n').find(Boolean);
    if (!line) {
      return undefined;
    }

    return line.split(/\s+/)[0];
  }

  private runGit(args: string[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return signal
      ? this.exec('git', args, { cancelSignal: signal })
      : this.exec('git', args);
  }
}
