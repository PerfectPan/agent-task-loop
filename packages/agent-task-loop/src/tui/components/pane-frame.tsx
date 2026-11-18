import React from 'react';
import { Box } from 'ink';

/** The bordered box each dashboard pane draws: cyan while focused, dim gray otherwise. */
export function PaneFrame({
  width,
  focused,
  children,
}: {
  width: number;
  focused: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={focused ? 'cyan' : 'gray'}
      borderDimColor={!focused}
      paddingX={1}
      overflow="hidden"
      minHeight={0}
    >
      {children}
    </Box>
  );
}
