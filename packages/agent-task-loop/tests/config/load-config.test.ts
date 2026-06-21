import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, resolveConfigPath } from '../../src/config/load-config';

const originalCwd = process.cwd();
const originalAgentTaskLoopConfig = process.env.AGENT_TASK_LOOP_CONFIG;

const githubOnly = {
  githubIssues: { owner: 'o', repo: 'r' },
  projects: {},
  repositories: {},
  agents: {},
};

afterEach(() => {
  process.chdir(originalCwd);
  if (originalAgentTaskLoopConfig === undefined) {
    delete process.env.AGENT_TASK_LOOP_CONFIG;
  } else {
    process.env.AGENT_TASK_LOOP_CONFIG = originalAgentTaskLoopConfig;
  }
});

describe('resolveConfigPath / loadConfig (JSON only, 3-step)', () => {
  it('parses an explicit --config JSON file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'atl-explicit-'));
    const file = path.join(dir, 'cfg.json');
    await writeFile(file, JSON.stringify(githubOnly), 'utf8');
    try {
      expect(resolveConfigPath(file)).toBe(file);
      const cfg = await loadConfig(file);
      expect(cfg.githubIssues?.owner).toBe('o');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when an explicit --config path does not exist', () => {
    expect(() => resolveConfigPath('/no/such/config.json')).toThrow(/not found/);
  });

  it('prefers AGENT_TASK_LOOP_CONFIG when no --config is given', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'atl-env-'));
    const file = path.join(dir, 'custom.json');
    await writeFile(file, JSON.stringify({ ...githubOnly, projects: {} }), 'utf8');
    process.env.AGENT_TASK_LOOP_CONFIG = file;
    try {
      expect(resolveConfigPath()).toBe(file);
      const cfg = await loadConfig();
      expect(cfg.githubIssues?.repo).toBe('r');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not evaluate TS/JS config (JSON only)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'atl-ts-'));
    const file = path.join(dir, 'cfg.ts');
    await writeFile(file, 'export default { feishu: {} }', 'utf8');
    try {
      await expect(loadConfig(file)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('global config (3rd step) + no cwd walk-up', () => {
  const originalHome = os.homedir;
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(path.join(os.tmpdir(), 'atl-home-'));
    (os as unknown as { homedir: () => string }).homedir = () => fakeHome;
  });

  afterEach(async () => {
    (os as unknown as { homedir: () => string }).homedir = originalHome;
    await rm(fakeHome, { recursive: true, force: true });
  });

  it('falls back to ~/.agent-task-loop/config.json', async () => {
    const globalDir = path.join(fakeHome, '.agent-task-loop');
    await mkdir(globalDir, { recursive: true });
    const globalPath = path.join(globalDir, 'config.json');
    await writeFile(globalPath, JSON.stringify(githubOnly), 'utf8');

    const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'atl-empty-'));
    process.chdir(emptyDir);
    try {
      expect(resolveConfigPath()).toBe(globalPath);
      const cfg = await loadConfig();
      expect(cfg.githubIssues?.owner).toBe('o');
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('does NOT walk up cwd for a task.config.json (footgun removed)', async () => {
    // A project-local task.config.json must be ignored now; only --config/env/global count.
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'atl-proj-'));
    await writeFile(path.join(projectDir, 'task.config.json'), JSON.stringify(githubOnly), 'utf8');
    process.chdir(projectDir);
    try {
      // No global config exists under fakeHome → must throw rather than discover the cwd file.
      expect(() => resolveConfigPath()).toThrow(/No config found/);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });
});
