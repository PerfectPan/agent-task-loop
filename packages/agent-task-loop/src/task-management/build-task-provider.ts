import type { AppConfig } from '../config/schema';
import { CompositeTaskProvider } from './composite-task-provider';
import { FEISHU_SOURCE, FeishuTaskProvider } from './feishu-task-provider';
import { GitHubIssuesTaskProvider } from './github-issues-task-provider';
import type { SourceProvider, TaskProvider } from './task-provider';

/**
 * Builds the task provider for a config. Feishu is always the primary source;
 * any additional sources configured (e.g. GitHub Issues) are layered on with a
 * {@link CompositeTaskProvider} that reads from all and routes writes back to
 * the owning backend. With a single source the leaf provider is used directly.
 */
export function buildTaskProvider(config: AppConfig): TaskProvider {
  const providers: SourceProvider[] = [new FeishuTaskProvider(config)];

  if (config.githubIssues) {
    providers.push(new GitHubIssuesTaskProvider(config.githubIssues));
  }

  if (providers.length === 1) {
    return providers[0]!;
  }
  return new CompositeTaskProvider(providers, { defaultSource: FEISHU_SOURCE });
}
