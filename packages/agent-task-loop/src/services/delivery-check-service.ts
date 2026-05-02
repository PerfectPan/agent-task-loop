import { execa } from 'execa';

export interface DeliveryCheckInput {
  workspacePath: string;
  baseRef: string;
  publishCommit?: string;
  prLink?: string;
}

export interface DeliveryCheckResult {
  isDeliverable: boolean;
  reason: 'published' | 'working-tree-changes' | 'new-commit' | 'none';
}

type ExecLike = typeof execa;

export class DeliveryCheckService {
  constructor(private readonly exec: ExecLike = execa) {}

  async check(input: DeliveryCheckInput): Promise<DeliveryCheckResult> {
    if (input.prLink || input.publishCommit) {
      return { isDeliverable: true, reason: 'published' };
    }

    const statusResult = await this.exec('git', ['-C', input.workspacePath, 'status', '--short']);
    if (statusResult.stdout.trim().length > 0) {
      return { isDeliverable: true, reason: 'working-tree-changes' };
    }

    const headResult = await this.exec('git', ['-C', input.workspacePath, 'rev-parse', 'HEAD']);
    const baseResult = await this.exec('git', ['-C', input.workspacePath, 'rev-parse', input.baseRef]);

    if (headResult.stdout.trim() !== baseResult.stdout.trim()) {
      return { isDeliverable: true, reason: 'new-commit' };
    }

    return { isDeliverable: false, reason: 'none' };
  }
}
