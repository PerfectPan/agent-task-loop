import { normalizeGitHubRepos } from './github-repos';
import { SCAFFOLD_PLACEHOLDER } from './source-config';
import type { AppConfig } from './schema';

/** A path is "unset" if it's empty or still the scaffolded CHANGE_ME placeholder. */
function isUnsetPath(value: string | undefined): boolean {
  return !value || value.includes(SCAFFOLD_PLACEHOLDER);
}

/**
 * Guards a live command's config: at least one task source must be configured;
 * (only when Feishu is present) its baseToken/tableId must not be the documented
 * placeholders; and every configured GitHub repo must have a matching
 * `projects` / `repositories` entry with a real `localPath` — otherwise the run
 * path throws a confusing per-task "unknown project/repository" mid-execution.
 * Failing fast here turns that into one upfront, actionable setup error.
 */
export function assertRuntimeConfig(config: AppConfig): void {
  if (!config.feishu && !config.githubIssues) {
    throw new Error('configure at least one task source: feishu or githubIssues');
  }

  if (config.feishu) {
    const { baseToken, tableId } = config.feishu;
    const isPlaceholder = (value: string) => value.includes('demo') || value.includes('example');
    if (isPlaceholder(baseToken) || isPlaceholder(tableId)) {
      throw new Error(
        'Replace the example Feishu baseToken/tableId with real values before running live commands.',
      );
    }
  }

  if (config.githubIssues) {
    for (const repo of normalizeGitHubRepos(config.githubIssues)) {
      const projectKey = repo.repo; // mapIssue stamps project = repo name
      const repositoryKey = `${repo.owner}/${repo.repo}`; // …and repository = owner/repo
      const hint = `Run \`agent-task-loop source add --type github --owner ${repo.owner} --repo ${repo.repo}\` to scaffold them, then fill localPath/workspaceRoot.`;
      if (!config.projects?.[projectKey]) {
        throw new Error(`GitHub source ${repositoryKey} has no matching projects["${projectKey}"]. ${hint}`);
      }
      const repository = config.repositories?.[repositoryKey];
      if (!repository) {
        throw new Error(`GitHub source ${repositoryKey} has no matching repositories["${repositoryKey}"]. ${hint}`);
      }
      if (isUnsetPath(repository.localPath)) {
        throw new Error(`repositories["${repositoryKey}"].localPath is not set — replace the placeholder with this repo's local clone path before running.`);
      }
      const workspaceRoot = config.projects[projectKey]?.workspaceRoot;
      if (repository.workspaceStrategy === 'worktree' && isUnsetPath(workspaceRoot)) {
        throw new Error(`projects["${projectKey}"].workspaceRoot is not set — replace the placeholder with a directory for task worktrees before running.`);
      }
    }
  }
}
