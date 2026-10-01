import React from 'react';
import { Box, Text } from 'ink';
import type { SessionPreview as SessionPreviewData } from '../types';
import { heartbeatColor } from '../logic/heartbeat';
import { Spinner } from './spinner';

export function HeartbeatLine({ preview }: { preview: SessionPreviewData }): React.JSX.Element {
  const { state, ageMs } = preview.heartbeat;
  const age = ageMs == null ? '' : ` ${Math.round(ageMs / 1000)}s ago`;
  return (
    <Box>
      <Box width={10} flexShrink={0}>
        <Text dimColor>heartbeat</Text>
      </Box>
      <Text color={heartbeatColor(state)}>
        ●{age} ({state})
      </Text>
      {preview.live ? (
        <Text>
          {' '}
          <Spinner color="green" /> live
        </Text>
      ) : null}
    </Box>
  );
}
