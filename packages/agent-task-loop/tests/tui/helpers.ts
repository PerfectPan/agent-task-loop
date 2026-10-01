/**
 * Strip ANSI escape codes so frame assertions match on visible text only.
 * Pattern adapted from the `ansi-regex` package.
 */
const ANSI_PATTERN = [
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
  '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
].join('|');

const ANSI = new RegExp(ANSI_PATTERN, 'g');

export function stripAnsi(input: string): string {
  return input.replace(ANSI, '');
}

/** Fixed clock for deterministic timeAgo / heartbeat assertions. */
export const FIXED_NOW = Date.parse('2026-06-07T12:00:00.000Z');
export const fixedNow = () => FIXED_NOW;

/** ISO string `seconds` before FIXED_NOW. */
export function isoSecondsAgo(seconds: number): string {
  return new Date(FIXED_NOW - seconds * 1000).toISOString();
}

/**
 * Waits until ink is ready for the next stdin write. ink subscribes `useInput`
 * handlers in a passive effect, which React flushes from a `setImmediate`
 * callback. On a loaded machine a timer alone can fire first, and the write then
 * reaches no handler; the trailing `setImmediate` runs after the callbacks
 * already queued.
 *
 * A lone ESC is different: ink reports it only after a short delay in case the
 * rest of an escape sequence follows, so tests poll for its effect with
 * `vi.waitFor` instead.
 */
export async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise((resolve) => setImmediate(resolve));
}
