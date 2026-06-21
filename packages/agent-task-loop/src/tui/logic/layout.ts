/**
 * Pure layout math for the dashboard: minimum-size gating, how many vertical
 * rows the chrome (header/tabs/footer/borders) eats, and how the horizontal
 * space is divided between the list / detail / preview panes. Kept free of ink
 * and side effects so the App can call it on every resize and tests can pin
 * exact pixel math.
 */

/** Narrowest terminal we render the full three-pane layout in. */
export const MIN_COLS = 90;

/** Shortest terminal we render in before showing the "too small" notice. */
export const MIN_ROWS = 24;

/** Width of the status glyph + trailing space cell in a list row. */
export const BADGE_WIDTH = 2;

/** Width of the right-aligned priority cell in a list row. */
export const PRIORITY_WIDTH = 3;

/** Width of the selection marker cell ("❯ ") at the start of a list row. */
export const MARKER_WIDTH = 2;

/** Width of the task-id cell in a list row. */
export const TASK_ID_WIDTH = 9;

/** Width of the per-row source tag, shown only when the list spans >1 source. */
export const SOURCE_TAG_WIDTH = 12;

/**
 * Display width a list row reserves for everything except the flexible title:
 * pane borders + marker + badge + id + priority + one column of slack.
 */
export function rowChromeWidth(): number {
  return 2 + MARKER_WIDTH + BADGE_WIDTH + TASK_ID_WIDTH + PRIORITY_WIDTH + 1;
}

/** Smallest a pane may shrink to before its content becomes unreadable. */
const MIN_PANE = 10;

/**
 * True when the terminal is too small on either axis to host the dashboard;
 * the App should render a compact "resize me" hint instead.
 */
export function isBelowMinSize(cols: number, rows: number): boolean {
  return cols < MIN_COLS || rows < MIN_ROWS;
}

/**
 * Rows consumed by the persistent chrome (header, tab bar, footer, and the
 * surrounding borders). Subtract from the total terminal height to find how
 * many list rows fit: `visibleRows = max(1, totalRows - reservedRows())`.
 */
export function reservedRows(): number {
  return 8;
}

/** Integer column widths for the three panes, summing to <= `totalCols`. */
export interface ColumnWidths {
  list: number;
  detail: number;
  preview: number;
}

/**
 * Divide the available columns between the panes.
 *
 * - preview open  -> ~40% list / ~30% detail / ~30% preview
 * - preview closed -> preview 0, ~55% list / ~45% detail
 *
 * Each visible pane is floored to {@link MIN_PANE}, and the result never sums
 * past `totalCols` (any rounding slack is left as unused margin).
 */
export function computeColumnWidths(
  totalCols: number,
  opts: { previewOpen: boolean },
): ColumnWidths {
  const total = Math.max(0, Math.floor(totalCols));

  if (!opts.previewOpen) {
    const list = Math.max(MIN_PANE, Math.floor(total * 0.55));
    const detail = Math.max(MIN_PANE, total - list);
    return clamp({ list, detail, preview: 0 }, total, false);
  }

  const list = Math.max(MIN_PANE, Math.floor(total * 0.4));
  const detail = Math.max(MIN_PANE, Math.floor(total * 0.3));
  const preview = Math.max(MIN_PANE, total - list - detail);
  return clamp({ list, detail, preview }, total, true);
}

/**
 * Ensure the panes fit within `total`. When the naive split overflows (tight
 * terminals where every pane hit its minimum), trim from the widest pane first
 * so the layout degrades gracefully instead of clipping.
 */
function clamp(w: ColumnWidths, total: number, previewOpen: boolean): ColumnWidths {
  const result: ColumnWidths = { ...w };
  const panes: Array<keyof ColumnWidths> = previewOpen
    ? ['list', 'detail', 'preview']
    : ['list', 'detail'];

  let overflow = result.list + result.detail + result.preview - total;
  while (overflow > 0) {
    const widest = panes.reduce((a, b) => (result[b] > result[a] ? b : a));
    if (result[widest] <= MIN_PANE) {
      break;
    }
    const take = Math.min(overflow, result[widest] - MIN_PANE);
    result[widest] -= take;
    overflow -= take;
  }

  return result;
}
