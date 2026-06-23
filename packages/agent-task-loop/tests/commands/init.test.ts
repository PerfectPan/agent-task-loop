import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@rivus/agent-finder-core', () => ({
  collectHostProbe: vi.fn().mockResolvedValue({}),
  discover: vi.fn().mockReturnValue({
    agents: [
      { id: 'claude-code', status: 'runnable' },
      { id: 'codex', status: 'missing' },
    ],
  }),
  resolveCommand: vi.fn(),
}));

import { resolveCommand } from '@rivus/agent-finder-core';
import { createGlobalConfig, discoverRunnableAgents, globalConfigPath, isLarkCliAvailable } from '../../src/commands/init';

const originalHome = os.homedir;
let fakeHome: string;

beforeEach(async () => {
  fakeHome = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-init-'));
  (os as unknown as { homedir: () => string }).homedir = () => fakeHome;
});

afterEach(async () => {
  (os as unknown as { homedir: () => string }).homedir = originalHome;
  await rm(fakeHome, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('isLarkCliAvailable', () => {
  it('returns true when resolveCommand finds lark-cli', async () => {
    vi.mocked(resolveCommand).mockReturnValue('/usr/local/bin/lark-cli');
    expect(await isLarkCliAvailable()).toBe(true);
  });

  it('returns false when resolveCommand returns null', async () => {
    vi.mocked(resolveCommand).mockReturnValue(null);
    expect(await isLarkCliAvailable()).toBe(false);
  });
});

describe('discoverRunnableAgents', () => {
  it('maps runnable claude-code to claude entry, skips missing codex', async () => {
    const agents = await discoverRunnableAgents();
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
    expect(written.repositories['o/r']).toMatchObject({ key: 'o/r', workspaceStrategy: 'worktree' });
    expect(written.repositories['o/r'].localPath).toContain('CHANGE_ME');
  });

  it('returns "exists" and does not overwrite when config already exists', async () => {
    const configPath = globalConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ feishu: { baseToken: 'original', tableId: 't' }, projects: {}, repositories: {}, agents: {} }), 'utf8');

    const result = createGlobalConfig({
      feishu: { baseToken: 'new-tok', tableId: 'new-tbl' },
      agents: {},
    });

    expect(result).toBe('exists');

    const contents = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(contents.feishu.baseToken).toBe('original');
  });
});
