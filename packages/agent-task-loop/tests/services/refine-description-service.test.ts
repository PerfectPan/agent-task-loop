import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/config/schema';
import { refineDescription } from '../../src/services/refine-description-service';

const withClaude = {
  githubIssues: { owner: 'o', repo: 'r' },
  projects: {},
  repositories: {},
  agents: { claude: { name: 'claude', command: 'claude', args: [], env: {} } },
} as unknown as AppConfig;

const withoutClaude = {
  githubIssues: { owner: 'o', repo: 'r' },
  projects: {},
  repositories: {},
  agents: { codex: { name: 'codex', command: 'codex', args: [], env: {} } },
} as unknown as AppConfig;

describe('refineDescription', () => {
  it('returns the refined description, stripping code fences', async () => {
    const runStructuredAi = vi.fn().mockResolvedValue({
      data: { description: '```\nrefined text\n```' },
      sessionName: 'refine-description-claude',
    });

    const result = await refineDescription(
      withClaude,
      { title: 'T', description: 'd' },
      { runStructuredAi },
    );

    expect(result).toBe('refined text');
    expect(runStructuredAi).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'claude', sessionName: 'refine-description-claude' }),
    );
  });

  it('throws a clear error when no claude agent is configured', async () => {
    await expect(
      refineDescription(withoutClaude, { title: 'T', description: 'd' }, { runStructuredAi: vi.fn() }),
    ).rejects.toThrow(/claude/);
  });
});
