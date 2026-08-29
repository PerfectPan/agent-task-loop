import { execa } from 'execa';

export interface PublishContext {
  workspacePath: string;
  branch: string;
  headCommit: string;
  isDirty: boolean;
  diffStat: string;
  diff: string;
  status: string;
}

type ExecLike = typeof execa;

export class PublishContextService {
  constructor(private readonly exec: ExecLike = execa) {}

  async load(workspacePath: string, signal?: AbortSignal): Promise<PublishContext> {
    signal?.throwIfAborted();
    const [branchResult, headResult, statusResult] = await Promise.all([
      this.runGit(['-C', workspacePath, 'branch', '--show-current'], signal),
      this.runGit(['-C', workspacePath, 'rev-parse', 'HEAD'], signal),
      this.runGit(['-C', workspacePath, 'status', '--short'], signal),
    ]);
    signal?.throwIfAborted();

    const status = statusResult.stdout.trim();
    const isDirty = status.length > 0;

    let diffStat = '';
    let diff = '';
    if (isDirty) {
      const [diffStatResult, diffResult] = await Promise.all([
        this.runGit(['-C', workspacePath, 'diff', '--stat'], signal),
        this.runGit(['-C', workspacePath, 'diff'], signal),
      ]);
      signal?.throwIfAborted();
      diffStat = diffStatResult.stdout;
      diff = diffResult.stdout;
    }

    return {
      workspacePath,
      branch: branchResult.stdout.trim(),
      headCommit: headResult.stdout.trim(),
      isDirty,
      diffStat,
      diff,
      status,
    };
  }

  private runGit(args: string[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return signal
      ? this.exec('git', args, { cancelSignal: signal })
      : this.exec('git', args);
  }
}
