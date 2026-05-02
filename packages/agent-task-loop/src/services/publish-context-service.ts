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

  async load(workspacePath: string): Promise<PublishContext> {
    const [branchResult, headResult, statusResult] = await Promise.all([
      this.exec('git', ['-C', workspacePath, 'branch', '--show-current']),
      this.exec('git', ['-C', workspacePath, 'rev-parse', 'HEAD']),
      this.exec('git', ['-C', workspacePath, 'status', '--short']),
    ]);

    const status = statusResult.stdout.trim();
    const isDirty = status.length > 0;

    let diffStat = '';
    let diff = '';
    if (isDirty) {
      const [diffStatResult, diffResult] = await Promise.all([
        this.exec('git', ['-C', workspacePath, 'diff', '--stat']),
        this.exec('git', ['-C', workspacePath, 'diff']),
      ]);
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
}
