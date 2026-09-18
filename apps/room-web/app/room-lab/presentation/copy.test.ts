import { describe, expect, it } from 'vitest';
import { copy } from './copy';

/**
 * The grammar of each copy group, kept mechanical so a colloquial status word
 * ("说完了") or a sentence in a label cannot come back unnoticed.
 */
const strings = (group: Record<string, unknown>) =>
  Object.entries(group).map(([key, value]) => [key, typeof value === 'function'
    ? (value as (...args: never[]) => string)(...(['codex', 2] as never[]))
    : String(value)] as const);

describe('copy grammar', () => {
  it('status words are short noun phrases with no punctuation or spoken particles', () => {
    for (const [key, text] of strings(copy.status)) {
      expect(text.length, key).toBeLessThanOrEqual(5);
      expect(text, key).not.toMatch(/[。，！？…、]/);
      expect(text, key).not.toMatch(/[了没吗吧呢啦]/);
    }
  });

  it('status words share the four shapes 已X · X中 · 待X · X失败, or are a bare state', () => {
    const shapes = /^(已.+|.+中|.*待.+|.+失败|在场|等待)$/;
    for (const [key, text] of strings(copy.status)) expect(text, key).toMatch(shapes);
  });

  it('actions are short verb phrases without sentence punctuation', () => {
    for (const [key, text] of strings(copy.action)) {
      expect(text.length, key).toBeLessThanOrEqual(12);
      expect(text, key).not.toMatch(/[。！？]/);
    }
  });

  it('labels never end in a full stop', () => {
    for (const [key, text] of strings(copy.label)) expect(text, key).not.toMatch(/。$/);
  });

  it('explanations that end in 。 are complete sentences, and spoken particles stay out of all groups', () => {
    for (const [key, text] of strings(copy.say)) {
      if (text.endsWith('。')) expect(text.length, key).toBeGreaterThan(6);
      expect(text, key).not.toMatch(/(说完了|没跑起来|答上了|没答上|叫到|先停下)/);
    }
  });

  it('one state, one word: the two finished states read the same', () => {
    expect(copy.status.posted).toBe(copy.status.completed);
    expect(copy.status.answered).toBe(copy.status.posted);
  });
});
