import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import type { TaskRecord } from '../../src/types/task';
import { resolveTaskExecutionContext } from '../../src/services/task-context-service';

const config = {
  feishu: { baseToken: 'base', tableId: 'table' },
  projects: {
    demo: {
      key: 'demo',
      name: 'Demo',
      defaultRepository: 'demo_workspace',
      workspaceRoot: '/tmp/workspaces',
      taskTemplatePrompt: '',
    },
  },
  repositories: {
    demo_workspace: {
      key: 'demo_workspace',
      localPath: '/tmp/demo',
      defaultBranch: 'main',
      installCommand: 'pnpm install',
      testCommand: 'pnpm test',
      buildCommand: 'pnpm build',
      workspaceStrategy: 'worktree',
    },
  },
  agents: {},
} as unknown as AppConfig;

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'TASK-1',
    title: 'Test task',
    description: 'desc',
    project: 'demo',
    targetAgent: 'codex',
    priority: 1,
    status: '待处理',
    ...overrides,
  };
}

describe('resolveTaskExecutionContext', () => {
  it('resolves configured project and repository', () => {
    const result = resolveTaskExecutionContext(config, makeTask());

    expect(result.project.key).toBe('demo');
    expect(result.repository.key).toBe('demo_workspace');
  });

  it('throws a clear error for unknown project', () => {
    expect(() => resolveTaskExecutionContext(config, makeTask({ project: 'unknown_demo' }))).toThrow(
      /unknown project "unknown_demo"/,
    );
  });

  it('throws a clear error for unknown repository', () => {
    expect(() =>
      resolveTaskExecutionContext(config, makeTask({ repository: 'demo_repo' })),
    ).toThrow(/unknown repository "demo_repo"/);
  });
});
