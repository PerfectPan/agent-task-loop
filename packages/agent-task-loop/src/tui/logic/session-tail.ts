/**
 * Extract the last `n` lines of a block of text for the preview log tail.
 *
 * Splits on `\n`, drops trailing empty/whitespace-only lines (the common
 * trailing-newline noise from log files), and preserves order oldest..newest.
 * Internal blank lines are kept. Returns at most `n` lines; fewer if the text
 * has fewer. Empty/undefined input or `n <= 0` yields an empty array.
 */
export function tailLines(text: string | undefined, n: number): string[] {
  if (!text || n <= 0) return [];

  const lines = text.split('\n');

  // Drop trailing blank / whitespace-only lines.
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') {
    end -= 1;
  }

  return lines.slice(Math.max(0, end - n), end);
}
