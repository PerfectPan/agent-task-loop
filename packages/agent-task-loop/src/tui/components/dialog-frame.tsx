import React from 'react';
import { Box, Text } from 'ink';

/** The bordered cyan box a dialog that replaces the dashboard draws, with its title on top. */
export function DialogFrame({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} flexGrow={1} overflow="hidden">
      <Text bold color="cyan">
        {title}
      </Text>
      {children}
    </Box>
  );
}
