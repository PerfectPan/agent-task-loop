import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';

type ExecLike = typeof execa;

export class GitPublishService {
  constructor(private readonly exec: ExecLike = execa) {}

  async commitAll(input: { workspacePath: string; message: string }): Promise<void> {
    const status = await this.exec('git', ['-C', input.workspacePath, 'status', '--short']);
    if (!status.stdout.trim()) {
      return;
    }

    await this.exec('git', ['-C', input.workspacePath, 'add', '-A']);

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-commit-'));
    const messageFile = path.join(tempDir, 'COMMIT_EDITMSG');

    try {
      await writeFile(messageFile, `${input.message.trim()}\n`, 'utf8');
      await this.exec('git', ['-C', input.workspacePath, 'commit', '-F', messageFile]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async pushBranch(input: { workspacePath: string; branch: string }): Promise<void> {
    await this.exec('git', ['-C', input.workspacePath, 'push', '-u', 'origin', input.branch]);
  }

  async getRemoteBranchHead(input: { workspacePath: string; branch: string }): Promise<string | undefined> {
    const result = await this.exec('git', ['-C', input.workspacePath, 'ls-remote', '--heads', 'origin', input.branch]);
    const line = result.stdout.trim().split('\n').find(Boolean);
    if (!line) {
      return undefined;
    }

    return line.split(/\s+/)[0];
  }
}
