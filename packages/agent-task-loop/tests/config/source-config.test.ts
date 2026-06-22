import { describe, expect, it } from 'vitest';
import {
  addFeishuSource,
  addGitHubRepo,
  listSources,
  removeSource,
  type EditableConfig,
} from '../../src/config/source-config';

const empty: EditableConfig = { projects: {}, repositories: {}, agents: {} };
const feishu = { baseToken: 'tok', tableId: 'tbl' };

describe('listSources', () => {
  it('lists feishu first then each github repo, marking the default', () => {
    const cfg: EditableConfig = {
      ...empty,
      feishu,
      githubIssues: { defaultAgent: 'codex', repositories: [{ owner: 'o', repo: 'a' }, { owner: 'o', repo: 'b' }] },
    };
    expect(listSources(cfg)).toEqual([
      { id: 'feishu', label: 'Feishu Base', isDefault: true },
      { id: 'github:o/a', label: 'o/a', isDefault: false },
      { id: 'github:o/b', label: 'o/b', isDefault: false },
    ]);
  });

  it('defaults to the first github repo when there is no feishu', () => {
    const cfg: EditableConfig = { ...empty, githubIssues: { owner: 'o', repo: 'r', defaultAgent: 'codex' } };
    expect(listSources(cfg)).toEqual([{ id: 'github:o/r', label: 'o/r', isDefault: true }]);
  });

  it('returns [] for a config with no sources', () => {
    expect(listSources(empty)).toEqual([]);
  });
});

describe('addGitHubRepo', () => {
  it('creates the single shorthand when none exists, keeping feishu', () => {
    const out = addGitHubRepo({ ...empty, feishu }, { owner: 'o', repo: 'r', defaultAgent: 'codex' });
    expect(out.feishu).toEqual(feishu);
    expect(out.githubIssues).toEqual({ owner: 'o', repo: 'r', defaultAgent: 'codex' });
  });

  it('appends to repositories[] when a github repo already exists', () => {
    const single: EditableConfig = { ...empty, githubIssues: { owner: 'o', repo: 'a', defaultAgent: 'codex' } };
    const out = addGitHubRepo(single, { owner: 'o', repo: 'b', defaultAgent: 'claude' });
    expect(out.githubIssues).toMatchObject({
      defaultAgent: 'codex',
      repositories: [
        { owner: 'o', repo: 'a', defaultAgent: 'codex' },
        { owner: 'o', repo: 'b', defaultAgent: 'claude' },
      ],
    });
  });

  it('throws on a duplicate owner/repo', () => {
    const single: EditableConfig = { ...empty, githubIssues: { owner: 'o', repo: 'a', defaultAgent: 'codex' } };
    expect(() => addGitHubRepo(single, { owner: 'o', repo: 'a' })).toThrow(/already configured/);
  });

  it('does not mutate the input', () => {
    const single: EditableConfig = { ...empty, githubIssues: { owner: 'o', repo: 'a', defaultAgent: 'codex' } };
    addGitHubRepo(single, { owner: 'o', repo: 'b' });
    expect(single.githubIssues).toEqual({ owner: 'o', repo: 'a', defaultAgent: 'codex' });
  });
});

describe('addFeishuSource', () => {
  it('adds feishu, keeping github', () => {
    const cfg: EditableConfig = { ...empty, githubIssues: { owner: 'o', repo: 'r', defaultAgent: 'codex' } };
    const out = addFeishuSource(cfg, feishu);
    expect(out.feishu).toEqual(feishu);
    expect(out.githubIssues).toBeDefined();
  });

  it('throws when feishu already configured', () => {
    expect(() => addFeishuSource({ ...empty, feishu }, feishu)).toThrow(/already configured/);
  });
});

describe('removeSource', () => {
  it('removes feishu when another source remains', () => {
    const cfg: EditableConfig = { ...empty, feishu, githubIssues: { owner: 'o', repo: 'r', defaultAgent: 'codex' } };
    const out = removeSource(cfg, 'feishu');
    expect(out.feishu).toBeUndefined();
    expect(out.githubIssues).toBeDefined();
  });

  it('removes one github repo and collapses to single shorthand', () => {
    const cfg: EditableConfig = {
      ...empty,
      githubIssues: { defaultAgent: 'codex', repositories: [{ owner: 'o', repo: 'a' }, { owner: 'o', repo: 'b' }] },
    };
    const out = removeSource(cfg, 'github:o/a');
    expect(out.githubIssues).toMatchObject({ owner: 'o', repo: 'b' });
  });

  it('throws on unknown id', () => {
    expect(() => removeSource({ ...empty, feishu }, 'github:o/x')).toThrow(/not found|not configured/);
  });

  it('refuses to remove the last source', () => {
    expect(() => removeSource({ ...empty, feishu }, 'feishu')).toThrow(/last (task )?source/);
  });
});
