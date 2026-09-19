import { describe, expect, it } from 'vitest';
import { buildMentionOptions, mentionCompletion } from './mention-completion';
import { TEST_AGENTS, TEST_AGENT_IDS } from './testing/test-agents';

const OPTIONS = buildMentionOptions(TEST_AGENT_IDS, TEST_AGENTS);

describe('mentionCompletion', () => {
  it('finds a mention at the caret and inserts the selected agent', () => {
    const value = '请 @cla';
    const query = mentionCompletion.find(value, value.length);
    expect(query).toMatchObject({ query: 'cla' });
    expect(mentionCompletion.filter(query?.query ?? '', OPTIONS).map(option => option.id)).toEqual([
      'claude',
    ]);
    expect(mentionCompletion.insert(value, query!, OPTIONS[1]!)).toEqual({
      value: '请 @relay ',
      cursor: 9,
    });
  });

  it('does not complete an email-style embedded at-sign', () => {
    expect(mentionCompletion.find('owner@cod', 9)).toBeUndefined();
  });

  it('completes a mention after Chinese punctuation like the server parser', () => {
    const value = '请问，@cl';

    expect(mentionCompletion.find(value, value.length)).toMatchObject({
      start: 3,
      end: 6,
      query: 'cl',
    });
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
