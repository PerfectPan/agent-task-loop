import type { TargetAgent } from '../types/task';
import type { GitHubIssuesConfig } from './schema';

/** A single GitHub repository resolved from the (single- or multi-repo) config. */
export interface ResolvedGitHubRepo {
  owner: string;
  repo: string;
  token?: string;
  defaultAgent: TargetAgent;
}

/**
 * Flattens a `githubIssues` config into one entry per repository. Supports the
 * single-repo shorthand (`owner`/`repo`) and the multi-repo `repositories[]`
 * form. The shared `token` applies to every repo; `defaultAgent` falls back
 * from the per-repo override to the source-level default.
 */
export function normalizeGitHubRepos(config: GitHubIssuesConfig): ResolvedGitHubRepo[] {
  const fallbackAgent = (config.defaultAgent ?? 'codex') as TargetAgent;

  if (config.repositories && config.repositories.length > 0) {
    return config.repositories.map(entry => ({
      owner: entry.owner,
      repo: entry.repo,
      token: config.token,
      defaultAgent: (entry.defaultAgent ?? fallbackAgent) as TargetAgent,
    }));
  }

  if (config.owner && config.repo) {
    return [{ owner: config.owner, repo: config.repo, token: config.token, defaultAgent: fallbackAgent }];
  }

  return [];
}
