import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceAddCommand, sourceListCommand, sourceRemoveCommand } from '../../src/commands/source';
import { appConfigSchema } from '../../src/config/schema';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atl-source-'));
  file = join(dir, 'config.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const read = () => JSON.parse(readFileSync(file, 'utf8'));

describe('source add', () => {
  it('creates a github-only config when none exists', async () => {
    await sourceAddCommand.run?.({ args: { type: 'github', owner: 'o', repo: 'r', config: file } } as never);
    const cfg = read();
    expect(cfg.githubIssues).toEqual({ owner: 'o', repo: 'r', defaultAgent: 'codex' });
    expect(appConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it('appends a second github repo to repositories[]', async () => {
    await sourceAddCommand.run?.({ args: { type: 'github', owner: 'o', repo: 'a', config: file } } as never);
    await sourceAddCommand.run?.({ args: { type: 'github', owner: 'o', repo: 'b', agent: 'claude', config: file } } as never);
    const cfg = read();
    expect(cfg.githubIssues.repositories).toEqual([
      { owner: 'o', repo: 'a', defaultAgent: 'codex' },
      { owner: 'o', repo: 'b', defaultAgent: 'claude' },
    ]);
  });

  it('adds feishu alongside github without clobbering it', async () => {
    await sourceAddCommand.run?.({ args: { type: 'github', owner: 'o', repo: 'r', config: file } } as never);
    await sourceAddCommand.run?.({ args: { type: 'feishu', token: 'tok', table: 'tbl', config: file } } as never);
    const cfg = read();
    expect(cfg.feishu).toEqual({ baseToken: 'tok', tableId: 'tbl' });
    expect(cfg.githubIssues).toBeDefined();
  });
});

describe('source list', () => {
  it('prints sources with a default marker', async () => {
    await sourceAddCommand.run?.({ args: { type: 'github', owner: 'o', repo: 'r', config: file } } as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    sourceListCommand.run?.({ args: { config: file } } as never);
    const printed = log.mock.calls.map(c => String(c[0])).join('\n');
    expect(printed).toContain('* github:o/r');
  });
});

describe('source remove', () => {
  it('removes a source and keeps the file valid', async () => {
    await sourceAddCommand.run?.({ args: { type: 'github', owner: 'o', repo: 'a', config: file } } as never);
    await sourceAddCommand.run?.({ args: { type: 'github', owner: 'o', repo: 'b', config: file } } as never);
    sourceRemoveCommand.run?.({ args: { id: 'github:o/a', config: file } } as never);
    const cfg = read();
    expect(cfg.githubIssues).toMatchObject({ owner: 'o', repo: 'b' });
    expect(appConfigSchema.safeParse(cfg).success).toBe(true);
  });
});
