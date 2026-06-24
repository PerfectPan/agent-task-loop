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

  const githubRunnable = {
    agents: {},
    githubIssues: { owner: 'o', repo: 'r' },
    projects: { r: { key: 'r', name: 'r', defaultRepository: 'o/r', workspaceRoot: '/ws', taskTemplatePrompt: '' } },
    repositories: { 'o/r': { key: 'o/r', localPath: '/repo', defaultBranch: 'main', workspaceStrategy: 'worktree' } },
  } as unknown as AppConfig;

  it('passes for a github-only config with matching project/repository entries', () => {
    expect(() => assertRuntimeConfig(githubRunnable)).not.toThrow();
  });

  it('rejects a github source with no matching project entry', () => {
    const bad = { ...base, githubIssues: { owner: 'o', repo: 'r' } } as unknown as AppConfig;
    expect(() => assertRuntimeConfig(bad)).toThrow(/no matching projects\["r"\]/);
  });

  it('rejects a github source whose repository.localPath is empty', () => {
    const bad = {
      agents: {},
      githubIssues: { owner: 'o', repo: 'r' },
      projects: { r: { key: 'r', name: 'r', defaultRepository: 'o/r', workspaceRoot: '/ws', taskTemplatePrompt: '' } },
      repositories: { 'o/r': { key: 'o/r', localPath: '', defaultBranch: 'main', workspaceStrategy: 'worktree' } },
    } as unknown as AppConfig;
    expect(() => assertRuntimeConfig(bad)).toThrow(/localPath is not set/);
  });

  it('rejects a worktree github project whose workspaceRoot is empty', () => {
    const bad = {
      agents: {},
      githubIssues: { owner: 'o', repo: 'r' },
      projects: { r: { key: 'r', name: 'r', defaultRepository: 'o/r', workspaceRoot: '', taskTemplatePrompt: '' } },
      repositories: { 'o/r': { key: 'o/r', localPath: '/repo', defaultBranch: 'main', workspaceStrategy: 'worktree' } },
    } as unknown as AppConfig;
    expect(() => assertRuntimeConfig(bad)).toThrow(/workspaceRoot is not set/);
  });

  it('rejects when no task source is configured', () => {
    expect(() => assertRuntimeConfig(base)).toThrow(/at least one task source/);
  });
});
