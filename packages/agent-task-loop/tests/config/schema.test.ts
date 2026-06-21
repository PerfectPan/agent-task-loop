import { describe, expect, it } from 'vitest';
import { appConfigSchema } from '../../src/config/schema';

const base = { projects: {}, repositories: {}, agents: {} };
const feishu = { baseToken: 'tok', tableId: 'tbl' };
const github = { owner: 'o', repo: 'r' };

describe('appConfigSchema', () => {
  it('accepts feishu-only', () => {
    expect(appConfigSchema.safeParse({ ...base, feishu }).success).toBe(true);
  });

  it('accepts github-only (no feishu)', () => {
    expect(appConfigSchema.safeParse({ ...base, githubIssues: github }).success).toBe(true);
  });

  it('accepts both sources', () => {
    expect(appConfigSchema.safeParse({ ...base, feishu, githubIssues: github }).success).toBe(true);
  });

  it('rejects neither source with a clear message', () => {
    const result = appConfigSchema.safeParse(base);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('at least one task source'))).toBe(true);
    }
  });
});
