import { describe, expect, it } from 'vitest';
import {
  BADGE_WIDTH,
  MIN_COLS,
  MIN_ROWS,
  PRIORITY_WIDTH,
  computeColumnWidths,
  isBelowMinSize,
  reservedRows,
} from '../../../src/tui/logic/layout';

describe('minimum size', () => {
  it('declares 90x24 as the minimum', () => {
    expect(MIN_COLS).toBe(90);
    expect(MIN_ROWS).toBe(24);
  });

  it('isBelowMinSize is true below the minimum on either axis', () => {
    expect(isBelowMinSize(89, 24)).toBe(true);
    expect(isBelowMinSize(90, 23)).toBe(true);
    expect(isBelowMinSize(0, 0)).toBe(true);
    expect(isBelowMinSize(50, 10)).toBe(true);
  });

  it('isBelowMinSize is false at or above the minimum on both axes', () => {
    expect(isBelowMinSize(90, 24)).toBe(false);
    expect(isBelowMinSize(120, 40)).toBe(false);
    expect(isBelowMinSize(200, 60)).toBe(false);
  });
});

describe('reservedRows', () => {
  it('is a positive constant', () => {
    expect(reservedRows()).toBeGreaterThan(0);
    expect(reservedRows()).toBe(reservedRows());
    expect(Number.isInteger(reservedRows())).toBe(true);
  });
});

describe('computeColumnWidths', () => {
  it('sums to <= total and each pane > 0 when preview is open', () => {
    for (const total of [90, 100, 120, 160, 200, 240]) {
      const w = computeColumnWidths(total, { previewOpen: true });
      expect(w.list).toBeGreaterThan(0);
      expect(w.detail).toBeGreaterThan(0);
      expect(w.preview).toBeGreaterThan(0);
      expect(w.list + w.detail + w.preview).toBeLessThanOrEqual(total);
      expect(Number.isInteger(w.list)).toBe(true);
      expect(Number.isInteger(w.detail)).toBe(true);
      expect(Number.isInteger(w.preview)).toBe(true);
    }
  });

  it('roughly splits 40/30/30 when preview is open', () => {
    const total = 200;
    const w = computeColumnWidths(total, { previewOpen: true });
    expect(w.list).toBeCloseTo(total * 0.4, -1);
    expect(w.detail).toBeCloseTo(total * 0.3, -1);
    expect(w.preview).toBeCloseTo(total * 0.3, -1);
  });

  it('drops preview to 0 and grows list/detail when preview is closed', () => {
    const total = 200;
    const open = computeColumnWidths(total, { previewOpen: true });
    const closed = computeColumnWidths(total, { previewOpen: false });
    expect(closed.preview).toBe(0);
    expect(closed.list).toBeGreaterThan(open.list);
    expect(closed.detail).toBeGreaterThan(open.detail);
    expect(closed.list + closed.detail).toBeLessThanOrEqual(total);
  });

  it('splits ~55/45 between list and detail when preview is closed', () => {
    const total = 200;
    const w = computeColumnWidths(total, { previewOpen: false });
    expect(w.list).toBeCloseTo(total * 0.55, -1);
    expect(w.detail).toBeCloseTo(total * 0.45, -1);
  });

  it('enforces sane minimums even at the smallest supported width', () => {
    const w = computeColumnWidths(MIN_COLS, { previewOpen: true });
    expect(w.list).toBeGreaterThanOrEqual(10);
    expect(w.detail).toBeGreaterThanOrEqual(10);
    expect(w.preview).toBeGreaterThanOrEqual(10);
    expect(w.list + w.detail + w.preview).toBeLessThanOrEqual(MIN_COLS);
  });
});

describe('row column math consts', () => {
  it('exposes fixed badge and priority widths', () => {
    expect(BADGE_WIDTH).toBeGreaterThan(0);
    expect(PRIORITY_WIDTH).toBeGreaterThan(0);
    expect(Number.isInteger(BADGE_WIDTH)).toBe(true);
    expect(Number.isInteger(PRIORITY_WIDTH)).toBe(true);
  });
});
