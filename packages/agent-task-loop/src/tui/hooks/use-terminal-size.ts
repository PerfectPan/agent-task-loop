import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

/** Fallback dimensions when the stdout stream does not report its size. */
const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

export interface TerminalSize {
  columns: number;
  rows: number;
}

/**
 * Track the current terminal dimensions, re-rendering on stdout `resize`.
 *
 * Reads `stdout.columns` / `stdout.rows` with 80x24 fallbacks and subscribes
 * to the stream's `resize` event, cleaning up the listener on unmount.
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();

  const read = (): TerminalSize => ({
    columns: stdout?.columns ?? DEFAULT_COLUMNS,
    rows: stdout?.rows ?? DEFAULT_ROWS,
  });

  const [size, setSize] = useState<TerminalSize>(read);

  useEffect(() => {
    if (!stdout) return;
    const onResize = (): void => {
      setSize({
        columns: stdout.columns ?? DEFAULT_COLUMNS,
        rows: stdout.rows ?? DEFAULT_ROWS,
      });
    };
    stdout.on('resize', onResize);
    // Sync once in case the size changed before the listener attached.
    onResize();
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return size;
}
