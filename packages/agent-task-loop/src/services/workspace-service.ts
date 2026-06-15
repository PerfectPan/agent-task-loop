import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

interface WorkspaceInput {
  workspaceRoot: string;
  taskId: string;
  agent: string;
  strategy: 'existing-repo' | 'worktree';
  repositoryPath: string;
  defaultBranch?: string;
  existingWorkspacePath?: string;
}

function normalizePath(value: string): string {
  return path.resolve(value);
}

function shouldReuseExistingWorkspace(input: WorkspaceInput): boolean {
  if (!input.existingWorkspacePath) {
    return false;
  }

  const existingWorkspacePath = normalizePath(input.existingWorkspacePath);
  const repositoryPath = normalizePath(input.repositoryPath);
  const workspaceRoot = normalizePath(input.workspaceRoot);

  if (existingWorkspacePath === repositoryPath) {
    return false;
  }

  return existingWorkspacePath === workspaceRoot || existingWorkspacePath.startsWith(`${workspaceRoot}${path.sep}`);
}

export function resolveWorkspacePath(input: WorkspaceInput): string {
  if (input.strategy === 'existing-repo') {
    return input.repositoryPath;
  }
  if (shouldReuseExistingWorkspace(input) && input.existingWorkspacePath) {
    return input.existingWorkspacePath;
  }
  return `${input.workspaceRoot}/${input.taskId}`;
}

function buildWorktreeBranchName(taskId: string): string {
  return `task/${taskId}`
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-');
}

export async function ensureWorkspace(input: WorkspaceInput): Promise<string> {
  const workspacePath = resolveWorkspacePath(input);
  if (input.strategy === 'existing-repo') {
    return workspacePath;
  }

  await mkdir(input.workspaceRoot, { recursive: true });
  if (existsSync(workspacePath)) {
    return workspacePath;
  }

  await execa(
    'git',
    [
      '-C',
      input.repositoryPath,
      'worktree',
      'add',
      '-B',
      buildWorktreeBranchName(input.taskId),
      workspacePath,
      input.defaultBranch ?? 'main',
    ],
    { reject: true },
  );

  return workspacePath;
}
