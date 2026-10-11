import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('@rivus/agent-kit/discovery', () => ({
  detectAgents: vi.fn().mockResolvedValue([
    { agent: 'claude-code', displayName: 'Claude Code', status: 'found', command: '/usr/local/bin/claude' },
    { agent: 'codex', displayName: 'Codex', status: 'missing' },
  ]),
}));

vi.mock('@rivus/agent-kit/node', () => ({
  createNodePlatform: vi.fn().mockReturnValue({}),
}));

import { detectAgents } from '@rivus/agent-kit/discovery';
import {
  createGlobalConfig,
  discoverRunnableAgents,
  globalConfigPath,
  isLarkCliAvailable,
} from '../../src/commands/init';

const originalHome = os.homedir;
const originalPath = process.env.PATH;
let fakeHome: string;

beforeEach(async () => {
  fakeHome = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-init-'));
  (os as unknown as { homedir: () => string }).homedir = () => fakeHome;
});

afterEach(async () => {
  (os as unknown as { homedir: () => string }).homedir = originalHome;
  process.env.PATH = originalPath;
  await rm(fakeHome, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('isLarkCliAvailable', () => {
  it('returns true when lark-cli is on PATH', async () => {
    const binDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-path-'));
    await writeFile(path.join(binDir, 'lark-cli'), '', { mode: 0o755 });
    process.env.PATH = binDir;
    expect(await isLarkCliAvailable()).toBe(true);
  });

  it('returns false when lark-cli is not on PATH', async () => {
    const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-path-'));
    process.env.PATH = emptyDir;
    expect(await isLarkCliAvailable()).toBe(false);
  });
});

describe('discoverRunnableAgents', () => {
  it('detects claude-code and codex without running any agent command', async () => {
    const agents = await discoverRunnableAgents();
    expect(detectAgents).toHaveBeenCalledWith(expect.anything(), {
      agents: ['claude-code', 'codex'],
      versionProbe: false,
    });
    expect(Object.keys(agents)).toEqual(['claude']);
    expect(agents.claude).toEqual({ name: 'claude', command: 'claude', args: [], env: {} });
    expect(agents.codex).toBeUndefined();
  });
});

describe('createGlobalConfig', () => {
  it('writes config.json with feishu and agents', () => {
    const result = createGlobalConfig({
      feishu: { baseToken: 'tok', tableId: 'tbl' },
      agents: {
        claude: { name: 'claude', command: 'claude', args: [], env: {} },
        codex: { name: 'codex', command: 'codex', args: [], env: {} },
      },
    });

    expect(result).toBe('created');

    const written = JSON.parse(readFileSync(globalConfigPath(), 'utf8'));
    expect(written.feishu.baseToken).toBe('tok');
    expect(written.feishu.tableId).toBe('tbl');
    expect(written.githubIssues).toBeUndefined();
    expect(written.agents.claude.command).toBe('claude');
    expect(written.agents.codex.command).toBe('codex');
    expect(written.projects).toEqual({});
    expect(written.repositories).toEqual({});
  });

  it('writes a github-only config without a feishu block', () => {
    const result = createGlobalConfig({
      githubIssues: { owner: 'o', repo: 'r', defaultAgent: 'codex' },
      agents: { codex: { name: 'codex', command: 'codex', args: [], env: {} } },
    });

    expect(result).toBe('created');

    const written = JSON.parse(readFileSync(globalConfigPath(), 'utf8'));
    expect(written.feishu).toBeUndefined();
    expect(written.githubIssues).toEqual({ owner: 'o', repo: 'r', defaultAgent: 'codex' });
    // The matching project/repository entries are scaffolded (keyed repo / owner/repo)
    // so the GitHub-only config is runnable once the CHANGE_ME paths are filled in.
    expect(written.projects.r).toMatchObject({ key: 'r', defaultRepository: 'o/r' });
    expect(written.repositories['o/r']).toMatchObject({
      key: 'o/r',
      workspaceStrategy: 'worktree',
    });
    expect(written.repositories['o/r'].localPath).toContain('CHANGE_ME');
  });

  it('returns "exists" and does not overwrite when config already exists', async () => {
    const configPath = globalConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        feishu: { baseToken: 'original', tableId: 't' },
        projects: {},
        repositories: {},
        agents: {},
      }),
      'utf8',
    );

    const result = createGlobalConfig({
      feishu: { baseToken: 'new-tok', tableId: 'new-tbl' },
      agents: {},
    });

    expect(result).toBe('exists');

    const contents = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(contents.feishu.baseToken).toBe('original');
  });
});
