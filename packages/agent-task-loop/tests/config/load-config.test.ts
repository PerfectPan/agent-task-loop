import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  it('resolves task.config.json from the current working directory', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-json-'));
    const configPath = path.join(tempDir, 'task.config.json');

    await writeFile(
      configPath,
      JSON.stringify({
        feishu: { baseToken: 'json-base', tableId: 'json-table' },
        projects: {
          demo: { key: 'demo', name: 'JsonDemo', defaultRepository: 'demo_repo', workspaceRoot: '/tmp/demo', taskTemplatePrompt: 'hi' },
        },
        repositories: {
          demo_repo: { key: 'demo_repo', localPath: '/tmp/demo', defaultBranch: 'main', installCommand: 'pnpm install', testCommand: 'pnpm test', buildCommand: 'pnpm build', workspaceStrategy: 'worktree' },
        },
        agents: {
          claude: { name: 'claude', command: 'claude', args: [], env: {} },
          codex: { name: 'codex', command: 'codex', args: [], env: {} },
          coco: { name: 'coco', command: 'coco', args: [], env: {} },
          glm: { name: 'glm', command: 'glm', args: [], env: {} },
        },
      }),
      'utf8',
    );

    process.chdir(tempDir);

    try {
      expect(resolveConfigPath().endsWith('/task.config.json')).toBe(true);
      const config = await loadConfig();
      expect(config.feishu.baseToken).toBe('json-base');
      expect(config.projects.demo.name).toBe('JsonDemo');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('global config fallback', () => {
  const originalHome = os.homedir;
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-home-'));
    (os as unknown as { homedir: () => string }).homedir = () => fakeHome;
  });

  afterEach(async () => {
    (os as unknown as { homedir: () => string }).homedir = originalHome;
    await rm(fakeHome, { recursive: true, force: true });
  });

  it('falls back to global config when no project config exists', async () => {
    const globalDir = path.join(fakeHome, '.agent-task-loop');
    await mkdir(globalDir, { recursive: true });
    const globalConfigPath = path.join(globalDir, 'config.json');
    await writeFile(
      globalConfigPath,
      JSON.stringify({
        feishu: { baseToken: 'global-base', tableId: 'global-table' },
        projects: {},
        repositories: {},
        agents: { claude: { name: 'claude', command: 'claude', args: [], env: {} } },
      }),
      'utf8',
    );

    const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-empty-'));
    process.chdir(emptyDir);

    try {
      expect(resolveConfigPath()).toBe(globalConfigPath);
      const config = await loadConfig();
      expect(config.feishu.baseToken).toBe('global-base');
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('project config takes precedence over global config', async () => {
    const globalDir = path.join(fakeHome, '.agent-task-loop');
    await mkdir(globalDir, { recursive: true });
    await writeFile(
      path.join(globalDir, 'config.json'),
      JSON.stringify({
        feishu: { baseToken: 'global-base', tableId: 'global-table' },
        projects: {},
        repositories: {},
        agents: { claude: { name: 'claude', command: 'claude', args: [], env: {} } },
      }),
      'utf8',
    );

    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-project-'));
    await writeFile(
      path.join(projectDir, 'task.config.json'),
      JSON.stringify({
        feishu: { baseToken: 'project-base', tableId: 'project-table' },
        projects: {},
        repositories: {},
        agents: { claude: { name: 'claude', command: 'claude', args: [], env: {} } },
      }),
      'utf8',
    );

    process.chdir(projectDir);

    try {
      const config = await loadConfig();
      expect(config.feishu.baseToken).toBe('project-base');
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });
});
