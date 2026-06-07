/**
 * Pure scroll/selection math for the list pane. No fs, no timers, no React —
 * just index arithmetic so the viewport logic stays trivially testable.
 */

/**
 * Clamp an index into the valid `[0, length - 1]` range.
 * Returns 0 when the list is empty (or length is non-positive).
 */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index > length - 1) {
    return length - 1;
  }
  return index;
}

/**
 * Move the selection by `delta`, clamped to the list bounds. Never wraps:
 * stepping past either end leaves the selection pinned at that end.
 */
export function nextIndex(current: number, delta: number, length: number): number {
  return clampIndex(current + delta, length);
}

/**
 * Compute the visible slice `[start, end)` (end exclusive) of a scrolling list.
 *
 * The window size is `min(rows, total)` and it always contains
 * `selectedIndex`: when the selection drops below the current window the window
 * shifts down, when it rises above it the window shifts up. `start` is never
 * negative and `end` never exceeds `total`.
 */
export function computeVisibleWindow(
  total: number,
  selectedIndex: number,
  rows: number,
): { start: number; end: number } {
  const size = Math.min(Math.max(rows, 0), Math.max(total, 0));
  if (size <= 0) {
    return { start: 0, end: 0 };
  }

  const selected = clampIndex(selectedIndex, total);

  // Anchor the window so the selection sits inside it, then pull it back inside
  // the [0, total] bounds.
  let start = selected - Math.floor(size / 2);
  start = Math.max(0, Math.min(start, total - size));

  return { start, end: start + size };
}
