/**
 * CJK-aware display width and width-bounded truncation for terminal layout.
 *
 * East-Asian "wide" code points occupy two terminal cells; everything else is
 * treated as a single cell. No external dependency — the wide ranges are
 * inlined so layout math stays deterministic across environments.
 */

const ELLIPSIS = '…';

/** Inclusive code-point ranges that render two cells wide in a terminal. */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0xa4cf], // CJK radicals … Yi (incl. Unified Ideographs, Kana)
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe30, 0xfe4f], // CJK Compatibility Forms
  [0xff00, 0xff60], // Fullwidth Forms
  [0xffe0, 0xffe6], // Fullwidth signs
];

function isWide(codePoint: number): boolean {
  for (const [lo, hi] of WIDE_RANGES) {
    if (codePoint >= lo && codePoint <= hi) {
      return true;
    }
  }
  return false;
}

/**
 * Display width of `text` in terminal cells: East-Asian wide characters count
 * as 2, everything else as 1.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    width += cp !== undefined && isWide(cp) ? 2 : 1;
  }
  return width;
}

/**
 * Take a leading slice of `text` whose display width does not exceed `budget`.
 * Stops before any character that would overflow (so a wide char is dropped
 * whole rather than half-rendered).
 */
function headSlice(text: string, budget: number): string {
  let out = '';
  let used = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const w = cp !== undefined && isWide(cp) ? 2 : 1;
    if (used + w > budget) {
      break;
    }
    out += ch;
    used += w;
  }
  return out;
}

/** Take a trailing slice of `text` whose display width does not exceed `budget`. */
function tailSlice(text: string, budget: number): string {
  const chars = [...text];
  let out = '';
  let used = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i]!;
    const cp = ch.codePointAt(0);
    const w = cp !== undefined && isWide(cp) ? 2 : 1;
    if (used + w > budget) {
      break;
    }
    out = ch + out;
    used += w;
  }
  return out;
}

/**
 * Truncate `text` so its display width never exceeds `maxWidth`, inserting a
 * single-width ellipsis when characters are dropped.
 *
 * - Returns `text` unchanged when it already fits.
 * - `'end'` (default) keeps the head; `'middle'` keeps head + tail around `…`.
 * - For `maxWidth <= 0` returns `''`; for `maxWidth === 1` (when truncation is
 *   needed) returns just the ellipsis.
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  position: 'end' | 'middle' = 'end',
): string {
  if (maxWidth <= 0) {
    return '';
  }
  if (displayWidth(text) <= maxWidth) {
    return text;
  }
  // Truncation needed; reserve one cell for the ellipsis.
  const budget = maxWidth - 1;
  if (budget <= 0) {
    return ELLIPSIS;
  }

  if (position === 'middle') {
    const headBudget = Math.ceil(budget / 2);
    const tailBudget = budget - headBudget;
    const head = headSlice(text, headBudget);
    const tail = tailBudget > 0 ? tailSlice(text, tailBudget) : '';
    return head + ELLIPSIS + tail;
  }

  return headSlice(text, budget) + ELLIPSIS;
}
