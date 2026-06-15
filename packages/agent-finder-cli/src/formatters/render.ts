/**
 * Dependency-free terminal presentation helpers.
 *
 * Kept local to agent-finder-cli for now; this is the seed of the shared
 * `cli-presentation` layer described in docs/plans/issue-25-shared-sessions.md
 * (the human-output redesign tracked by #23). Color is emitted only on an
 * interactive TTY and never when NO_COLOR is set, so `--json` and piped/CI
 * output stay plain and stable.
 */

const ESC = String.fromCharCode(27);
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const sgr = (open: number, close = 0) => (text: string): string =>
  useColor ? `${ESC}[${open}m${text}${ESC}[${close}m` : text;

export const style = {
  bold: sgr(1, 22),
  dim: sgr(2, 22),
  green: sgr(32, 39),
  yellow: sgr(33, 39),
  red: sgr(31, 39),
  cyan: sgr(36, 39),
  gray: sgr(90, 39)
};

const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

/** Visible width, ignoring ANSI escape sequences. */
function visibleWidth(text: string): number {
  return text.replace(ANSI_PATTERN, "").length;
}

/** Collapse newlines/runs of whitespace so a value always renders on one row. */
function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, max: number): string {
  if (max <= 1 || text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function padEnd(text: string, width: number): string {
  const pad = width - visibleWidth(text);
  return pad > 0 ? text + " ".repeat(pad) : text;
}

export interface Column<T> {
  header: string;
  /** Plain (uncolored) cell value used for layout. */
  get: (row: T) => string;
  /** Optional color applied to the already-padded cell. */
  color?: (row: T) => (text: string) => string;
  /** Hard cap; the flex column also shrinks to fit the terminal width. */
  max?: number;
  /** When true this column absorbs the remaining terminal width. */
  flex?: boolean;
}

const GAP = "  ";
const DEFAULT_TERM_WIDTH = 80;

/**
 * Render rows as an aligned, optionally colored table with a styled header.
 * Widths are computed from plain text so color codes never break alignment.
 */
export function renderTable<T>(columns: Column<T>[], rows: T[]): string[] {
  const plain = rows.map((row) => columns.map((col) => clean(col.get(row))));

  const termWidth = process.stdout.columns ?? DEFAULT_TERM_WIDTH;
  const widths = columns.map((col, i) => {
    const longest = Math.max(col.header.length, ...plain.map((r) => r[i].length), 0);
    return col.max ? Math.min(longest, col.max) : longest;
  });

  // Let the flex column shrink to fit the remaining terminal budget.
  const flexIndex = columns.findIndex((col) => col.flex);
  if (flexIndex >= 0) {
    const fixed = widths.reduce((sum, w, i) => (i === flexIndex ? sum : sum + w), 0);
    const gaps = GAP.length * (columns.length - 1);
    const budget = termWidth - fixed - gaps;
    if (budget > 0) widths[flexIndex] = Math.min(widths[flexIndex], Math.max(budget, 8));
  }

  const header = columns
    .map((col, i) => style.dim(style.bold(padEnd(col.header.toUpperCase(), widths[i]))))
    .join(GAP)
    .trimEnd();

  const body = rows.map((row, r) =>
    columns
      .map((col, i) => {
        const cell = padEnd(truncate(plain[r][i], widths[i]), widths[i]);
        return col.color ? col.color(row)(cell) : cell;
      })
      .join(GAP)
      .trimEnd()
  );

  return [header, ...body];
}

export interface KeyValue {
  label: string;
  value: string;
}

/** Render aligned `label   value` rows with dimmed labels. */
export function renderKeyValues(rows: KeyValue[]): string[] {
  const width = Math.max(0, ...rows.map((r) => r.label.length));
  return rows.map((r) => `${style.dim(padEnd(`${r.label}:`, width + 1))}  ${r.value}`);
}
