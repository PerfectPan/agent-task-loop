import { describe, expect, it } from 'vitest';
import { displayWidth, truncateToWidth } from '../../../src/tui/logic/truncate';

describe('displayWidth', () => {
  it('counts ASCII chars as width 1', () => {
    expect(displayWidth('hello')).toBe(5);
    expect(displayWidth('')).toBe(0);
  });

  it('counts CJK chars as width 2', () => {
    expect(displayWidth('修复中')).toBe(6);
    expect(displayWidth('待复核')).toBe(6);
  });

  it('mixes ASCII and CJK widths', () => {
    expect(displayWidth('a修b')).toBe(4);
  });

  it('counts fullwidth forms and kana as width 2', () => {
    expect(displayWidth('ＡＢ')).toBe(4); // fullwidth latin
    expect(displayWidth('あ')).toBe(2); // hiragana
    expect(displayWidth('가')).toBe(2); // hangul
  });
});

describe('truncateToWidth', () => {
  it('returns short strings untouched', () => {
    expect(truncateToWidth('hello', 10)).toBe('hello');
    expect(truncateToWidth('hello', 5)).toBe('hello');
  });

  it('end-truncates ASCII with an ellipsis', () => {
    const out = truncateToWidth('hello world', 5);
    expect(out).toBe('hell…');
    expect(displayWidth(out)).toBeLessThanOrEqual(5);
  });

  it('never exceeds maxWidth for CJK strings', () => {
    const out = truncateToWidth('修复中执行中', 5);
    expect(displayWidth(out)).toBeLessThanOrEqual(5);
    expect(out.endsWith('…')).toBe(true);
  });

  it('truncates CJK by width not char count', () => {
    // '修复中' is width 6; maxWidth 4 -> one CJK char + ellipsis = width 3 (can't fit a 4th)
    const out = truncateToWidth('修复中', 4);
    expect(displayWidth(out)).toBeLessThanOrEqual(4);
    expect(out).toBe('修…');
  });

  it('middle mode preserves the tail', () => {
    const out = truncateToWidth('abcdefghij', 7, 'middle');
    expect(displayWidth(out)).toBeLessThanOrEqual(7);
    expect(out).toContain('…');
    expect(out.startsWith('a')).toBe(true);
    expect(out.endsWith('j')).toBe(true);
  });

  it('handles maxWidth <= 1 edge', () => {
    expect(truncateToWidth('hello', 1)).toBe('…');
    expect(truncateToWidth('hello', 0)).toBe('');
    expect(truncateToWidth('修复中', 1)).toBe('…');
  });
});
