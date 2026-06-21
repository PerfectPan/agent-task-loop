import { normalizeGitHubRepos } from '../config/github-repos';
import type { AppConfig } from '../config/schema';
import { CompositeTaskProvider } from './composite-task-provider';
import { FeishuTaskProvider } from './feishu-task-provider';
import { GitHubIssuesTaskProvider } from './github-issues-task-provider';
import type { SourceProvider, TaskProvider } from './task-provider';

/**
 * Builds the task provider for a config. Each configured source contributes a
 * leaf provider: Feishu when `feishu` is present, and one GitHub Issues
 * provider per configured repository (`github:<owner>/<repo>`). With a single
 * source the leaf provider is used directly; with several, a
 * {@link CompositeTaskProvider} reads from all and routes writes back to the
 * owning backend. The default write target is Feishu when configured, otherwise
 * the first GitHub repository.
 */
export function buildTaskProvider(config: AppConfig): TaskProvider {
  const providers: SourceProvider[] = [];
  if (config.feishu) {
    providers.push(new FeishuTaskProvider(config));
  }
  if (config.githubIssues) {
    for (const repo of normalizeGitHubRepos(config.githubIssues)) {
      providers.push(new GitHubIssuesTaskProvider(repo));
    }
  }

  if (providers.length === 0) {
    throw new Error('configure at least one task source: feishu or githubIssues');
  }
  if (providers.length === 1) {
    return providers[0]!;
  }

  // providers[0] is Feishu when configured, else the first GitHub repo.
  return new CompositeTaskProvider(providers, { defaultSource: providers[0]!.source });
}
