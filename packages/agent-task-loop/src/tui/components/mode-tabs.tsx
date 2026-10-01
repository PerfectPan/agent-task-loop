import React from 'react';
import { Box, Text } from 'ink';
import type { PreviewMode } from '../types';
import { PREVIEW_MODES } from '../types';

const MODE_LABELS: Record<PreviewMode, string> = {
  output: 'output',
  history: 'history',
  logs: 'transcript',
};

export function ModeTabs({ mode }: { mode: PreviewMode }): React.JSX.Element {
  return (
    <Box>
      {PREVIEW_MODES.map((m, i) => (
        <Text key={m}>
          {i > 0 ? ' ' : ''}
          <Text color={m === mode ? 'cyan' : undefined} dimColor={m !== mode} bold={m === mode}>
            {m === mode ? '▸' : '·'}
            {MODE_LABELS[m]}
          </Text>
        </Text>
      ))}
    </Box>
  );
}
