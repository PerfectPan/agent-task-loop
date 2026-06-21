import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { buildTaskProvider } from '../../src/task-management/build-task-provider';

const base = { projects: {}, repositories: {}, agents: {} } as unknown as AppConfig;
const feishu = { baseToken: 't', tableId: 'b' };
const github = { owner: 'o', repo: 'r', defaultAgent: 'codex' as const };

describe('buildTaskProvider', () => {
  it('github-only (single repo) → a single github provider', () => {
    const provider = buildTaskProvider({ ...base, githubIssues: github } as AppConfig);
    expect((provider as { source?: string }).source).toBe('github:o/r');
  });

  it('feishu-only → a single feishu provider', () => {
    const provider = buildTaskProvider({ ...base, feishu } as AppConfig);
    expect((provider as { source?: string }).source).toBe('feishu');
  });

  it('github multi-repo → a composite with one source per repo', () => {
    const provider = buildTaskProvider({
      ...base,
      githubIssues: { defaultAgent: 'codex', repositories: [{ owner: 'o', repo: 'a' }, { owner: 'o', repo: 'b' }] },
    } as AppConfig);
    expect((provider as { source?: string }).source).toBeUndefined();
    expect((provider as { sources?: string[] }).sources).toEqual(['github:o/a', 'github:o/b']);
  });

  it('both → a composite defaulting to feishu', () => {
    const provider = buildTaskProvider({ ...base, feishu, githubIssues: github } as AppConfig);
    expect((provider as { source?: string }).source).toBeUndefined();
    expect((provider as { sources?: string[] }).sources).toEqual(['feishu', 'github:o/r']);
  });

  it('throws when no source is configured', () => {
    expect(() => buildTaskProvider(base)).toThrow(/at least one task source/);
  });
});
