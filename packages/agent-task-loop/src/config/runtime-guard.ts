import type { AppConfig } from './schema';

/**
 * Guards a live command's config: at least one task source must be configured,
 * and (only when Feishu is present) its baseToken/tableId must not be the
 * documented placeholders. GitHub-only configs pass without a Feishu check.
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
}
