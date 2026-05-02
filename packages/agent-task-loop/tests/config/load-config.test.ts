import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, resolveConfigPath } from '../../src/config/load-config';

const originalCwd = process.cwd();
const originalAgentTaskLoopConfig = process.env.AGENT_TASK_LOOP_CONFIG;

afterEach(() => {
  process.chdir(originalCwd);
  if (originalAgentTaskLoopConfig === undefined) {
    delete process.env.AGENT_TASK_LOOP_CONFIG;
  } else {
    process.env.AGENT_TASK_LOOP_CONFIG = originalAgentTaskLoopConfig;
  }
});

describe('loadConfig', () => {
  it('loads a valid task config file', async () => {
    const config = await loadConfig(new URL('../../task.config.example.ts', import.meta.url).pathname);
    expect(config.projects.demo.name).toBe('Demo');
    expect(config.repositories.demo_app.localPath).toContain('/workspace/demo-app');
    expect(config.agents.codex.command).toBe('codex');
  });

  it('discovers task.config.ts from the current working directory', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-config-'));
    const configPath = path.join(tempDir, 'task.config.ts');

    await writeFile(
      configPath,
      `export default {
        feishu: { baseToken: 'base', tableId: 'table' },
        projects: { demo: { key: 'demo', name: 'Demo', defaultRepository: 'demo_repo', workspaceRoot: '/tmp/demo', taskTemplatePrompt: 'hi' } },
        repositories: { demo_repo: { key: 'demo_repo', localPath: '/tmp/demo', defaultBranch: 'main', installCommand: 'pnpm install', testCommand: 'pnpm test', buildCommand: 'pnpm build', workspaceStrategy: 'worktree' } },
        agents: { claude: { name: 'claude', command: 'claude', args: [], env: {} }, codex: { name: 'codex', command: 'codex', args: [], env: {} }, coco: { name: 'coco', command: 'coco', args: [], env: {} }, glm: { name: 'glm', command: 'glm', args: [], env: {} } },
      };`,
      'utf8',
    );

    process.chdir(tempDir);

    expect(resolveConfigPath().endsWith('/task.config.ts')).toBe(true);

    const config = await loadConfig();
    expect(config.projects.demo.name).toBe('Demo');
    expect(config.repositories.demo_repo.defaultBranch).toBe('main');
  });

  it('prefers AGENT_TASK_LOOP_CONFIG when provided', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-config-env-'));
    const configPath = path.join(tempDir, 'custom.config.ts');

    await writeFile(
      configPath,
      `export default {
        feishu: { baseToken: 'env-base', tableId: 'env-table' },
        projects: { demo: { key: 'demo', name: 'EnvDemo', defaultRepository: 'demo_repo', workspaceRoot: '/tmp/demo', taskTemplatePrompt: 'hi' } },
        repositories: { demo_repo: { key: 'demo_repo', localPath: '/tmp/demo', defaultBranch: 'main', installCommand: 'pnpm install', testCommand: 'pnpm test', buildCommand: 'pnpm build', workspaceStrategy: 'worktree' } },
        agents: { claude: { name: 'claude', command: 'claude', args: [], env: {} }, codex: { name: 'codex', command: 'codex', args: [], env: {} }, coco: { name: 'coco', command: 'coco', args: [], env: {} }, glm: { name: 'glm', command: 'glm', args: [], env: {} } },
      };`,
      'utf8',
    );

    process.env.AGENT_TASK_LOOP_CONFIG = configPath;
    process.chdir(originalCwd);

    expect(resolveConfigPath()).toBe(configPath);

    const config = await loadConfig();
    expect(config.feishu.baseToken).toBe('env-base');
  });
});
