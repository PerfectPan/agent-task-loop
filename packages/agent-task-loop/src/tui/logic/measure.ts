import { displayWidth } from './truncate';

/**
 * Estimate how many terminal rows `text` occupies when soft-wrapped to `width`
 * columns (CJK-aware). Each explicit newline starts a new line; an empty line
 * still counts as one. Used to bound vertical scrolling without measuring the
 * laid-out ink tree (which `overflow: hidden` would clip anyway).
 */
export function wrappedLineCount(text: string | undefined, width: number): number {
  if (!text || width <= 0) return 0;
  return text
    .split('\n')
    .reduce((rows, line) => rows + Math.max(1, Math.ceil(displayWidth(line) / width)), 0);
}

/** Clamp a scroll offset to `[0, max(0, contentLines - viewportLines)]`. */
export function clampScroll(scroll: number, contentLines: number, viewportLines: number): number {
  const max = Math.max(0, contentLines - viewportLines);
  if (scroll < 0) return 0;
  if (scroll > max) return max;
  return scroll;
}

/** Largest valid scroll offset for the given content/viewport. */
export function maxScroll(contentLines: number, viewportLines: number): number {
  return Math.max(0, contentLines - viewportLines);
}
