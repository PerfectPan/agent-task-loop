import type { AppConfig } from './schema';

export function assertFeishuRuntimeConfig(config: AppConfig): void {
  const { baseToken, tableId } = config.feishu;

  const isPlaceholderToken = baseToken.includes('demo') || baseToken.includes('example');
  const isPlaceholderTable = tableId.includes('demo') || tableId.includes('example');

  if (isPlaceholderToken || isPlaceholderTable) {
    throw new Error(
      'Replace the example Feishu baseToken/tableId with real values before running live commands.',
    );
  }
}
