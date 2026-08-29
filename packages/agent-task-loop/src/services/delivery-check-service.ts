import { execa } from 'execa';

export interface DeliveryCheckInput {
  workspacePath: string;
  baseRef: string;
  publishCommit?: string;
  prLink?: string;
  signal?: AbortSignal;
}

export interface DeliveryCheckResult {
  isDeliverable: boolean;
  reason: 'published' | 'working-tree-changes' | 'new-commit' | 'none';
}

type ExecLike = typeof execa;

export class DeliveryCheckService {
  constructor(private readonly exec: ExecLike = execa) {}

  async check(input: DeliveryCheckInput): Promise<DeliveryCheckResult> {
    input.signal?.throwIfAborted();
    if (input.prLink || input.publishCommit) {
      return { isDeliverable: true, reason: 'published' };
    }

    const statusResult = await this.runGit(
      ['-C', input.workspacePath, 'status', '--short'],
      input.signal,
    );
    input.signal?.throwIfAborted();
    if (statusResult.stdout.trim().length > 0) {
      return { isDeliverable: true, reason: 'working-tree-changes' };
    }

    const headResult = await this.runGit(
      ['-C', input.workspacePath, 'rev-parse', 'HEAD'],
      input.signal,
    );
    input.signal?.throwIfAborted();
    const baseResult = await this.runGit(
      ['-C', input.workspacePath, 'rev-parse', input.baseRef],
      input.signal,
    );
    input.signal?.throwIfAborted();

    if (headResult.stdout.trim() !== baseResult.stdout.trim()) {
      return { isDeliverable: true, reason: 'new-commit' };
    }

    return { isDeliverable: false, reason: 'none' };
  }

  private runGit(args: string[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return signal
      ? this.exec('git', args, { cancelSignal: signal })
      : this.exec('git', args);
  }
}
