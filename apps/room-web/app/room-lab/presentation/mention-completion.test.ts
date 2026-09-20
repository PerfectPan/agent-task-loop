import { describe, expect, it } from 'vitest';
import { buildMentionOptions, mentionCompletion } from './mention-completion';
import { TEST_AGENTS, TEST_AGENT_IDS } from './testing/test-agents';

const OPTIONS = buildMentionOptions(TEST_AGENT_IDS, TEST_AGENTS);

describe('mentionCompletion', () => {
  it('narrows the list by id or by label, and offers everyone for an empty query', () => {
    expect(mentionCompletion.filter('cla', OPTIONS).map(option => option.id)).toEqual(['claude']);
    expect(mentionCompletion.filter('dsh', OPTIONS).map(option => option.id)).toEqual(['dsh']);
    expect(mentionCompletion.filter('', OPTIONS)).toEqual(OPTIONS);
    expect(mentionCompletion.filter('nobody', OPTIONS)).toEqual([]);
  });

  it('offers only the active composition in its configured order, with its colours', () => {
    const options = buildMentionOptions(['dsh', 'codex'], TEST_AGENTS);

    expect(options.map(option => option.id)).toEqual(['all', 'dsh', 'codex']);
    expect(options[0]?.label).toBe('All 2 active agents');
    expect(options[1]).toMatchObject({ label: 'DSH', description: '分析', color: 5 });
  });

  it('still offers a seated member the registry no longer describes', () => {
    const options = buildMentionOptions(['ghost'], TEST_AGENTS);

    expect(options[1]).toEqual({ id: 'ghost', label: 'ghost', description: '' });
  });
});
