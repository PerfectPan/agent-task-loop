import { describe, expect, it } from 'vitest';
import { normalizeGitHubRepos } from '../../src/config/github-repos';
import type { GitHubIssuesConfig } from '../../src/config/schema';

describe('normalizeGitHubRepos', () => {
  it('expands the single-repo shorthand', () => {
    const cfg = { owner: 'o', repo: 'r', token: 't', defaultAgent: 'codex' } as GitHubIssuesConfig;
    expect(normalizeGitHubRepos(cfg)).toEqual([{ owner: 'o', repo: 'r', token: 't', defaultAgent: 'codex' }]);
  });

  it('expands repositories[] and applies shared token + agent fallback', () => {
    const cfg = {
      token: 'shared',
      defaultAgent: 'codex',
      repositories: [
        { owner: 'o', repo: 'a' },
        { owner: 'o', repo: 'b', defaultAgent: 'claude' },
      ],
    } as GitHubIssuesConfig;
    expect(normalizeGitHubRepos(cfg)).toEqual([
      { owner: 'o', repo: 'a', token: 'shared', defaultAgent: 'codex' },
      { owner: 'o', repo: 'b', token: 'shared', defaultAgent: 'claude' },
    ]);
  });
});
