import { describe, expect, it } from 'vitest';
import { resolveWorkspacePath } from '../../src/services/workspace-service';

describe('resolveWorkspacePath', () => {
  it('uses worktree strategy to build a dedicated path', () => {
    const workspace = resolveWorkspacePath({
      workspaceRoot: '/tmp/workspaces',
      taskId: 'TASK-42',
      agent: 'codex',
      strategy: 'worktree',
      repositoryPath: '/repo/app',
    });
    expect(workspace).toBe('/tmp/workspaces/TASK-42');
  });

  it('reuses the existing workspace path when the task already has one', () => {
    const workspace = resolveWorkspacePath({
      workspaceRoot: '/repo/.worktrees',
      taskId: 'TASK-42',
      agent: 'codex',
      existingWorkspacePath: '/repo/.worktrees/TASK-42-claude',
      strategy: 'worktree',
      repositoryPath: '/repo/app',
    });
    expect(workspace).toBe('/repo/.worktrees/TASK-42-claude');
  });

  it('ignores the repository root when worktree mode receives a stale main-repo workspace path', () => {
    const workspace = resolveWorkspacePath({
      workspaceRoot: '/repo/.worktrees',
      taskId: 'TASK-42',
      agent: 'codex',
      existingWorkspacePath: '/repo/app',
      strategy: 'worktree',
      repositoryPath: '/repo/app',
    });
    expect(workspace).toBe('/repo/.worktrees/TASK-42');
  });

  it('ignores existing paths that are outside the configured worktree root', () => {
    const workspace = resolveWorkspacePath({
      workspaceRoot: '/repo/.worktrees',
      taskId: 'TASK-42',
      agent: 'codex',
      existingWorkspacePath: '/tmp/TASK-42',
      strategy: 'worktree',
      repositoryPath: '/repo/app',
    });
    expect(workspace).toBe('/repo/.worktrees/TASK-42');
  });
});
