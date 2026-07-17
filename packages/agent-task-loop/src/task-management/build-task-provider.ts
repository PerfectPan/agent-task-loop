import { normalizeGitHubRepos } from '../config/github-repos';
import type { AppConfig } from '../config/schema';
import { CompositeTaskProvider } from './composite-task-provider';
import { FeishuTaskProvider } from './feishu-task-provider';
import { GitHubIssuesTaskProvider } from './github-issues-task-provider';
import { StatefulTaskProvider } from './stateful-task-provider';
import { FileTaskStateStore } from './task-state-store';
import type { SourceProvider, TaskProvider } from './task-provider';

export interface BuildTaskProviderOptions {
  readFailureMode?: 'best-effort' | 'strict';
}

/**
 * Builds the task provider for a config. Each configured source contributes a
 * leaf provider: Feishu when `feishu` is present, and one GitHub Issues
 * provider per configured repository (`github:<owner>/<repo>`). With a single
 * source the leaf provider is used directly; with several, a
 * {@link CompositeTaskProvider} reads from all and routes writes back to the
 * owning backend. The default write target is Feishu when configured, otherwise
 * the first GitHub repository.
 */
export function buildTaskProvider(
  config: AppConfig,
  options: BuildTaskProviderOptions = {},
): TaskProvider {
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

  // providers[0] is Feishu when configured, else the first GitHub repo.
  const inner: TaskProvider =
    providers.length === 1
      ? providers[0]!
      : new CompositeTaskProvider(providers, {
          defaultSource: providers[0]!.source,
          readFailureMode: options.readFailureMode,
        });

  // Wrap the whole tree so the loop's run-time state (session ids, runner info,
  // …) is persisted source-agnostically — see RFC 0006. Providers stay unaware.
  const store = new FileTaskStateStore();
  // Best-effort orphan sweep so the store can't grow without bound. The TTL is
  // deliberately generous (180d) so an in-flight task is never pruned out from
  // under the loop; completed GitHub tasks have a closed issue to fall back on.
  store.prune(180 * 24 * 60 * 60 * 1000);
  return new StatefulTaskProvider(inner, store);
}
