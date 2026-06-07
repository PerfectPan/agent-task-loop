import { describe, expect, it } from 'vitest';
import { clampScroll, maxScroll, wrappedLineCount } from '../../../src/tui/logic/measure';

describe('wrappedLineCount', () => {
  it('counts one row per short line', () => {
    expect(wrappedLineCount('a\nb\nc', 80)).toBe(3);
  });

  it('counts blank lines as one row each', () => {
    expect(wrappedLineCount('a\n\nb', 80)).toBe(3);
  });

  it('wraps long lines by width', () => {
    expect(wrappedLineCount('a'.repeat(25), 10)).toBe(3); // ceil(25/10)
  });

  it('counts CJK width as 2 per char', () => {
    // 6 wide chars => width 12 => ceil(12/4) = 3 rows
    expect(wrappedLineCount('修复并发认领', 4)).toBe(3);
  });

  it('returns 0 for empty/undefined or non-positive width', () => {
    expect(wrappedLineCount('', 80)).toBe(0);
    expect(wrappedLineCount(undefined, 80)).toBe(0);
    expect(wrappedLineCount('abc', 0)).toBe(0);
  });
});

describe('clampScroll / maxScroll', () => {
  it('clamps to zero floor', () => {
    expect(clampScroll(-5, 100, 10)).toBe(0);
  });

  it('clamps to the content/viewport ceiling', () => {
    expect(maxScroll(100, 10)).toBe(90);
    expect(clampScroll(999, 100, 10)).toBe(90);
  });

  it('passes through a valid offset', () => {
    expect(clampScroll(40, 100, 10)).toBe(40);
  });

  it('max is zero when content fits the viewport', () => {
    expect(maxScroll(5, 10)).toBe(0);
    expect(clampScroll(3, 5, 10)).toBe(0);
  });
});
