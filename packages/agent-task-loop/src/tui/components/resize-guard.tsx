import React from 'react';
import { Box, Text } from 'ink';
import { isBelowMinSize, MIN_COLS, MIN_ROWS } from '../logic/layout';

export interface ResizeGuardProps {
  /** Current terminal width in columns. */
  columns: number;
  /** Current terminal height in rows. */
  rows: number;
  /** Dashboard UI rendered only when the terminal is large enough. */
  children: React.ReactNode;
}

/**
 * Gate the dashboard on terminal size: when the viewport is below the minimum
 * width or height, render a single notice telling the user to resize (and the
 * current dimensions); otherwise render {@link ResizeGuardProps.children}.
 */
export function ResizeGuard({ columns, rows, children }: ResizeGuardProps): React.ReactElement {
  if (isBelowMinSize(columns, rows)) {
    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text color="yellow">
          {`Terminal too small — resize to at least ${MIN_COLS}x${MIN_ROWS} (now ${columns}x${rows})`}
        </Text>
      </Box>
    );
  }

  return <>{children}</>;
}
