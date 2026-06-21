import type { AppConfig } from '../config/schema';
import { CompositeTaskProvider } from './composite-task-provider';
import { FEISHU_SOURCE, FeishuTaskProvider } from './feishu-task-provider';
import { GITHUB_SOURCE, GitHubIssuesTaskProvider } from './github-issues-task-provider';
import type { SourceProvider, TaskProvider } from './task-provider';

/**
 * Builds the task provider for a config. Each configured source contributes a
 * leaf provider: Feishu when `feishu` is present, GitHub Issues when
 * `githubIssues` is present. With a single source the leaf provider is used
 * directly; with both, a {@link CompositeTaskProvider} reads from all and
 * routes writes back to the owning backend. The default write target is Feishu
 * when configured, otherwise GitHub.
 */
export function buildTaskProvider(config: AppConfig): TaskProvider {
  const providers: SourceProvider[] = [];
  if (config.feishu) {
    providers.push(new FeishuTaskProvider(config));
  }
  if (config.githubIssues) {
    providers.push(new GitHubIssuesTaskProvider(config.githubIssues));
  }

  if (providers.length === 0) {
    throw new Error('configure at least one task source: feishu or githubIssues');
  }
  if (providers.length === 1) {
    return providers[0]!;
  }

  const defaultSource = config.feishu ? FEISHU_SOURCE : GITHUB_SOURCE;
  return new CompositeTaskProvider(providers, { defaultSource });
}
