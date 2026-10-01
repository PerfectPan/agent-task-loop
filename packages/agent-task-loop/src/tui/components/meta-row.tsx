import React from 'react';
import { Box, Text } from 'ink';

export function MetaRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <Box>
      <Box width={10} flexShrink={0}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text wrap="truncate-end">{value}</Text>
    </Box>
  );
}
