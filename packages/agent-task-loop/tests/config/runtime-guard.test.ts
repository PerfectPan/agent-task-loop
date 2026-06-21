import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { assertRuntimeConfig } from '../../src/config/runtime-guard';

const base = { projects: {}, repositories: {}, agents: {} } as unknown as AppConfig;

const feishuConfig = {
  ...base,
  feishu: { baseToken: 'real_base_token', tableId: 'tbl_real_tasks' },
} as unknown as AppConfig;

describe('assertRuntimeConfig', () => {
  it('accepts non-placeholder feishu config', () => {
    expect(() => assertRuntimeConfig(feishuConfig)).not.toThrow();
  });

  it('rejects placeholder feishu config', () => {
    const bad = {
      ...base,
      feishu: { baseToken: 'demo_base_token', tableId: 'tbl_demo_tasks' },
    } as unknown as AppConfig;
    expect(() => assertRuntimeConfig(bad)).toThrow(
      'Replace the example Feishu baseToken/tableId with real values before running live commands.',
    );
  });

  it('passes for github-only config (no feishu)', () => {
    const github = {
      ...base,
      githubIssues: { owner: 'o', repo: 'r' },
    } as unknown as AppConfig;
    expect(() => assertRuntimeConfig(github)).not.toThrow();
  });

  it('rejects when no task source is configured', () => {
    expect(() => assertRuntimeConfig(base)).toThrow(/at least one task source/);
  });
});
