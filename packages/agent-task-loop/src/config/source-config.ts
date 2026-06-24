import { normalizeGitHubRepos } from './github-repos';
import type { AppConfig } from './schema';

/** The pre-validation config object shape the `source` ops read/write. */
export type EditableConfig = {
  feishu?: AppConfig['feishu'];
  githubIssues?: AppConfig['githubIssues'];
  projects?: Record<string, unknown>;
  repositories?: Record<string, unknown>;
  agents?: Record<string, unknown>;
};

export interface SourceSummary {
  id: string;
  label: string;
  isDefault: boolean;
}

type GitHubRepoEntry = { owner: string; repo: string; defaultAgent: string };

function clone(config: EditableConfig): EditableConfig {
  return JSON.parse(JSON.stringify(config)) as EditableConfig;
}

function githubId(owner: string, repo: string): string {
  return `github:${owner}/${repo}`;
}

/**
 * Sentinel embedded in scaffolded paths the user MUST replace. It is non-empty
 * (so the config still passes schema validation) but recognizable, so
 * `assertRuntimeConfig` can fail fast with a "fill this in" error rather than
 * letting the loop run against a bogus path.
 */
export const SCAFFOLD_PLACEHOLDER = 'CHANGE_ME';

/**
 * A GitHub task maps to `project = <repo name>` and `repository = <owner>/<repo>`
 * (see GitHubIssuesTaskProvider.mapIssue), and the run path looks those up in
 * `config.projects` / `config.repositories`. Without matching entries every task
 * throws "unknown project/repository". This scaffolds schema-valid entries (keyed
 * exactly as the run path expects) so a freshly-added GitHub source is runnable
 * once the user replaces the `CHANGE_ME` localPath / workspaceRoot placeholders.
 * Existing entries are left intact.
 */
export function ensureGitHubExecutionEntries(config: EditableConfig, owner: string, repo: string): void {
  const repositoryKey = `${owner}/${repo}`;
  config.projects ??= {};
  config.repositories ??= {};
  if (!config.projects[repo]) {
    config.projects[repo] = {
      key: repo,
      name: repo,
      defaultRepository: repositoryKey,
      workspaceRoot: `${SCAFFOLD_PLACEHOLDER}-absolute-dir-for-task-worktrees`,
      taskTemplatePrompt: '',
    };
  }
  if (!config.repositories[repositoryKey]) {
    config.repositories[repositoryKey] = {
      key: repositoryKey,
      localPath: `${SCAFFOLD_PLACEHOLDER}-absolute-path-to-local-clone`,
      defaultBranch: 'main',
      installCommand: 'pnpm install',
      testCommand: 'pnpm test',
      buildCommand: 'pnpm build',
      workspaceStrategy: 'worktree',
    };
  }
}

/**
 * Configured sources: feishu first (when present), then one entry per GitHub
 * repo. The default is feishu when configured, else the first GitHub repo.
 */
export function listSources(config: EditableConfig): SourceSummary[] {
  const out: SourceSummary[] = [];
  if (config.feishu) {
    out.push({ id: 'feishu', label: 'Feishu Base', isDefault: false });
  }
  if (config.githubIssues) {
    for (const repo of normalizeGitHubRepos(config.githubIssues)) {
      out.push({ id: githubId(repo.owner, repo.repo), label: `${repo.owner}/${repo.repo}`, isDefault: false });
    }
  }
  if (out.length > 0) {
    out[0]!.isDefault = true; // feishu is pushed first when present, else first github
  }
  return out;
}

/** Rebuilds a `githubIssues` block from a repo list, collapsing to the single
 *  shorthand when exactly one remains. */
function buildGitHubConfig(repos: GitHubRepoEntry[], token: string | undefined, topAgent: string): AppConfig['githubIssues'] {
  if (repos.length === 1) {
    const only = repos[0]!;
    return { ...(token ? { token } : {}), owner: only.owner, repo: only.repo, defaultAgent: only.defaultAgent } as AppConfig['githubIssues'];
  }
  return {
    ...(token ? { token } : {}),
    defaultAgent: topAgent,
    repositories: repos.map(r => ({ owner: r.owner, repo: r.repo, defaultAgent: r.defaultAgent })),
  } as AppConfig['githubIssues'];
}

export function addGitHubRepo(
  config: EditableConfig,
  repo: { owner: string; repo: string; defaultAgent?: string; token?: string },
): EditableConfig {
  const next = clone(config);
  const defaultAgent = repo.defaultAgent ?? 'codex';
  const gi = next.githubIssues;

  if (!gi) {
    next.githubIssues = { owner: repo.owner, repo: repo.repo, defaultAgent } as AppConfig['githubIssues'];
    if (repo.token) {
      (next.githubIssues as { token?: string }).token = repo.token;
    }
    ensureGitHubExecutionEntries(next, repo.owner, repo.repo);
    return next;
  }

  const existing = normalizeGitHubRepos(gi);
  if (existing.some(r => r.owner === repo.owner && r.repo === repo.repo)) {
    throw new Error(`GitHub repo already configured: ${repo.owner}/${repo.repo}`);
  }
  const repos: GitHubRepoEntry[] = [
    ...existing.map(r => ({ owner: r.owner, repo: r.repo, defaultAgent: r.defaultAgent })),
    { owner: repo.owner, repo: repo.repo, defaultAgent },
  ];
  next.githubIssues = buildGitHubConfig(repos, repo.token ?? gi.token, gi.defaultAgent ?? 'codex');
  ensureGitHubExecutionEntries(next, repo.owner, repo.repo);
  return next;
}

export function addFeishuSource(
  config: EditableConfig,
  feishu: { baseToken: string; tableId: string; viewId?: string },
): EditableConfig {
  if (config.feishu) {
    throw new Error('Feishu source already configured');
  }
  const next = clone(config);
  next.feishu = {
    baseToken: feishu.baseToken,
    tableId: feishu.tableId,
    ...(feishu.viewId ? { viewId: feishu.viewId } : {}),
  };
  return next;
}

export function removeSource(config: EditableConfig, id: string): EditableConfig {
  const next = clone(config);

  if (id === 'feishu') {
    if (!next.feishu) {
      throw new Error('Feishu source is not configured');
    }
    delete next.feishu;
  } else if (id.startsWith('github:')) {
    if (!next.githubIssues) {
      throw new Error(`Source not found: ${id}`);
    }
    const target = id.slice('github:'.length);
    const repos = normalizeGitHubRepos(next.githubIssues);
    if (!repos.some(r => `${r.owner}/${r.repo}` === target)) {
      throw new Error(`Source not found: ${id}`);
    }
    const remaining = repos.filter(r => `${r.owner}/${r.repo}` !== target);
    if (remaining.length === 0) {
      delete next.githubIssues;
    } else {
      next.githubIssues = buildGitHubConfig(
        remaining.map(r => ({ owner: r.owner, repo: r.repo, defaultAgent: r.defaultAgent })),
        next.githubIssues.token,
        next.githubIssues.defaultAgent ?? 'codex',
      );
    }
  } else {
    throw new Error(`Unknown source id: ${id} (expected 'feishu' or 'github:<owner>/<repo>')`);
  }

  if (!next.feishu && !next.githubIssues) {
    throw new Error('Cannot remove the last task source');
  }
  return next;
}
