import { describe, expect, it } from 'vitest';
import { clampIndex, computeVisibleWindow, nextIndex } from '../../../src/tui/logic/viewport';

describe('clampIndex', () => {
  it('returns 0 for empty list', () => {
    expect(clampIndex(0, 0)).toBe(0);
    expect(clampIndex(5, 0)).toBe(0);
    expect(clampIndex(-3, 0)).toBe(0);
  });

  it('returns 0 when length is negative', () => {
    expect(clampIndex(2, -1)).toBe(0);
  });

  it('clamps to the lower bound', () => {
    expect(clampIndex(-1, 5)).toBe(0);
    expect(clampIndex(-100, 5)).toBe(0);
  });

  it('clamps to the upper bound', () => {
    expect(clampIndex(5, 5)).toBe(4);
    expect(clampIndex(100, 5)).toBe(4);
  });

  it('leaves in-range indices untouched', () => {
    expect(clampIndex(0, 5)).toBe(0);
    expect(clampIndex(3, 5)).toBe(3);
    expect(clampIndex(4, 5)).toBe(4);
  });
});

describe('nextIndex', () => {
  it('moves by the delta when in range', () => {
    expect(nextIndex(2, 1, 5)).toBe(3);
    expect(nextIndex(2, -1, 5)).toBe(1);
    expect(nextIndex(0, 3, 5)).toBe(3);
  });

  it('clamps at the upper end and never wraps', () => {
    expect(nextIndex(4, 1, 5)).toBe(4);
    expect(nextIndex(4, 10, 5)).toBe(4);
    expect(nextIndex(0, 99, 5)).toBe(4);
  });

  it('clamps at the lower end and never wraps', () => {
    expect(nextIndex(0, -1, 5)).toBe(0);
    expect(nextIndex(0, -10, 5)).toBe(0);
    expect(nextIndex(2, -99, 5)).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(nextIndex(0, 1, 0)).toBe(0);
    expect(nextIndex(0, -1, 0)).toBe(0);
  });
});

describe('computeVisibleWindow', () => {
  it('returns the full range when rows >= total', () => {
    expect(computeVisibleWindow(5, 0, 10)).toEqual({ start: 0, end: 5 });
    expect(computeVisibleWindow(5, 2, 5)).toEqual({ start: 0, end: 5 });
  });

  it('returns an empty window when total is 0', () => {
    expect(computeVisibleWindow(0, 0, 10)).toEqual({ start: 0, end: 0 });
  });

  it('keeps the first item visible at index 0', () => {
    const win = computeVisibleWindow(20, 0, 5);
    expect(win).toEqual({ start: 0, end: 5 });
    expect(0).toBeGreaterThanOrEqual(win.start);
    expect(0).toBeLessThan(win.end);
  });

  it('keeps the last item visible', () => {
    const win = computeVisibleWindow(20, 19, 5);
    expect(win).toEqual({ start: 15, end: 20 });
    expect(19).toBeGreaterThanOrEqual(win.start);
    expect(19).toBeLessThan(win.end);
  });

  it('keeps a middle selection visible', () => {
    const win = computeVisibleWindow(20, 10, 5);
    expect(10).toBeGreaterThanOrEqual(win.start);
    expect(10).toBeLessThan(win.end);
    expect(win.end - win.start).toBe(5);
  });

  it('window size always equals min(rows, total)', () => {
    expect(computeVisibleWindow(20, 10, 5).end - computeVisibleWindow(20, 10, 5).start).toBe(5);
    expect(computeVisibleWindow(3, 1, 5).end - computeVisibleWindow(3, 1, 5).start).toBe(3);
    expect(computeVisibleWindow(8, 7, 4).end - computeVisibleWindow(8, 7, 4).start).toBe(4);
  });

  it('never produces a negative start nor an end beyond total', () => {
    for (let i = 0; i < 30; i++) {
      const win = computeVisibleWindow(30, i, 7);
      expect(win.start).toBeGreaterThanOrEqual(0);
      expect(win.end).toBeLessThanOrEqual(30);
      expect(i).toBeGreaterThanOrEqual(win.start);
      expect(i).toBeLessThan(win.end);
      expect(win.end - win.start).toBe(7);
    }
  });

  it('treats out-of-range selection by clamping it into a valid window', () => {
    const win = computeVisibleWindow(10, 99, 4);
    expect(win.end).toBeLessThanOrEqual(10);
    expect(win.start).toBeGreaterThanOrEqual(0);
    expect(win.end - win.start).toBe(4);
  });

  it('handles non-positive rows by yielding an empty window', () => {
    expect(computeVisibleWindow(10, 3, 0)).toEqual({ start: 0, end: 0 });
  });
});
