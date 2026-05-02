import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { assertFeishuRuntimeConfig } from '../../src/config/runtime-guard';

const baseConfig = {
  feishu: {
    baseToken: 'real_base_token',
    tableId: 'tbl_real_tasks',
  },
  projects: {},
  repositories: {},
  agents: {},
} as unknown as AppConfig;

describe('assertFeishuRuntimeConfig', () => {
  it('accepts non-placeholder feishu config', () => {
    expect(() => assertFeishuRuntimeConfig(baseConfig)).not.toThrow();
  });

  it('rejects placeholder feishu config', () => {
    const badConfig = {
      ...baseConfig,
      feishu: {
        baseToken: 'demo_base_token',
        tableId: 'tbl_demo_tasks',
      },
    } as AppConfig;

    expect(() => assertFeishuRuntimeConfig(badConfig)).toThrow(
      'Replace the example Feishu baseToken/tableId with real values before running live commands.',
    );
  });
});
