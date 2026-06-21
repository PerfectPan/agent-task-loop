import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { buildTaskProvider } from '../../src/task-management/build-task-provider';

const base = { projects: {}, repositories: {}, agents: {} } as unknown as AppConfig;
const feishu = { baseToken: 't', tableId: 'b' };
const github = { owner: 'o', repo: 'r', defaultAgent: 'codex' as const };

describe('buildTaskProvider', () => {
  it('github-only → a single github provider', () => {
    const provider = buildTaskProvider({ ...base, githubIssues: github } as AppConfig);
    expect((provider as { source?: string }).source).toBe('github');
  });

  it('feishu-only → a single feishu provider', () => {
    const provider = buildTaskProvider({ ...base, feishu } as AppConfig);
    expect((provider as { source?: string }).source).toBe('feishu');
  });

  it('both → a composite (no single .source) defaulting to feishu', () => {
    const provider = buildTaskProvider({ ...base, feishu, githubIssues: github } as AppConfig);
    expect((provider as { source?: string }).source).toBeUndefined();
    expect((provider as { defaultSource?: string }).defaultSource ?? 'feishu').toBe('feishu');
  });

  it('throws when no source is configured', () => {
    expect(() => buildTaskProvider(base)).toThrow(/at least one task source/);
  });
});
