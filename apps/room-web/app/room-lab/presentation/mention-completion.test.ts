import { describe, expect, it } from 'vitest';
import { mentionCompletion } from './mention-completion';

describe('mentionCompletion', () => {
  it('finds a mention at the caret and inserts the selected agent', () => {
    const value = '请 @cla';
    const query = mentionCompletion.find(value, value.length);
    expect(query).toMatchObject({ query: 'cla' });
    expect(mentionCompletion.filter(query?.query ?? '').map(option => option.id)).toEqual([
      'claude-relay',
      'claude',
    ]);
    expect(mentionCompletion.insert(value, query!, mentionCompletion.options[1]!)).toEqual({
      value: '请 @claude-relay ',
      cursor: 16,
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
});
