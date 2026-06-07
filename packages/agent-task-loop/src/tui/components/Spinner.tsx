import React, { useEffect, useState } from 'react';
import { Text } from 'ink';

/** Braille spinner frames cycled to indicate live activity. */
export const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/** Interval (ms) between spinner frame advances. */
export const FRAME_INTERVAL_MS = 80;

export interface SpinnerProps {
  /** Named ink color applied to the spinner glyph. */
  color?: string;
}

/**
 * Animated braille spinner. Advances one frame every {@link FRAME_INTERVAL_MS}
 * milliseconds via an interval started on mount and cleared on unmount.
 */
export function Spinner({ color }: SpinnerProps): React.JSX.Element {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{FRAMES[frame]}</Text>;
}
