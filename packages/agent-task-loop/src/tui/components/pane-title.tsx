import React from 'react';
import { Text } from 'ink';

/** A pane's bold title line, cyan while the pane is focused. */
export function PaneTitle({ focused, children }: { focused: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <Text bold color={focused ? 'cyan' : undefined}>
      {children}
    </Text>
  );
}
