import { describe, expect, it } from 'vitest';
import { tailLines } from '../../../src/tui/logic/session-tail';

describe('tailLines', () => {
  it('returns the last n lines (oldest..newest)', () => {
    const text = 'a\nb\nc\nd\ne';
    expect(tailLines(text, 2)).toEqual(['d', 'e']);
  });

  it('returns all lines when there are fewer than n', () => {
    const text = 'a\nb';
    expect(tailLines(text, 5)).toEqual(['a', 'b']);
  });

  it('strips trailing blank / whitespace-only lines', () => {
    const text = 'a\nb\nc\n\n   \n';
    expect(tailLines(text, 2)).toEqual(['b', 'c']);
  });

  it('returns [] for empty string', () => {
    expect(tailLines('', 3)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(tailLines(undefined, 3)).toEqual([]);
  });

  it('returns [] when n <= 0', () => {
    expect(tailLines('a\nb\nc', 0)).toEqual([]);
    expect(tailLines('a\nb\nc', -1)).toEqual([]);
  });

  it('preserves internal blank lines between content', () => {
    const text = 'a\n\nb\nc';
    expect(tailLines(text, 4)).toEqual(['a', '', 'b', 'c']);
  });
});
