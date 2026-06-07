import React from 'react';
import { Box, Text } from 'ink';
import type { PreviewMode, SessionPreview as SessionPreviewData } from '../types';
import { PREVIEW_MODES } from '../types';
import { heartbeatColor, runnerLabel } from '../logic/heartbeat';
import { Spinner } from './Spinner';

export interface SessionPreviewProps {
  preview: SessionPreviewData | null;
  mode: PreviewMode;
  width: number;
  focused: boolean;
  isLoading?: boolean;
  /** Vertical scroll offset in rows (content shifts up by this many lines). */
  scroll?: number;
}

const MODE_LABELS: Record<PreviewMode, string> = {
  output: 'output',
  history: 'history',
  logs: 'logs',
};

function ModeTabs({ mode }: { mode: PreviewMode }): React.JSX.Element {
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

function HeartbeatLine({ preview }: { preview: SessionPreviewData }): React.JSX.Element {
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

function MetaRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <Box>
      <Box width={10} flexShrink={0}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text wrap="truncate-end">{value}</Text>
    </Box>
  );
}

/** Right pane: a multi-mode view (output / history / logs) of the selected task's session. */
export function SessionPreview({
  preview,
  mode,
  width,
  focused,
  isLoading,
  scroll = 0,
}: SessionPreviewProps): React.JSX.Element {
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
      <ModeTabs mode={mode} />
      <Box flexGrow={1} flexDirection="column" overflow="hidden" minHeight={0}>
      <Box flexDirection="column" flexShrink={0} marginTop={-scroll}>
      {!preview ? (
        <Text dimColor>{isLoading ? 'Loading…' : 'No session'}</Text>
      ) : mode === 'output' ? (
        <Box flexDirection="column">
          {preview.sessionName ? <MetaRow label="name" value={preview.sessionName} /> : null}
          {preview.sessionId ? <MetaRow label="id" value={preview.sessionId} /> : null}
          <MetaRow label="runner" value={runnerLabel(preview.runner)} />
          <HeartbeatLine preview={preview} />
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>recent</Text>
            {preview.history.length === 0 ? (
              <Text dimColor>—</Text>
            ) : (
              preview.history.slice(-4).map((e, i) => (
                <Text key={`${e.round}-${e.kind}-${i}`} wrap="truncate-end">
                  r{e.round} {e.kind} {e.agent}
                </Text>
              ))
            )}
          </Box>
        </Box>
      ) : mode === 'history' ? (
        <Box flexDirection="column">
          {preview.history.length === 0 ? (
            <Text dimColor>No history</Text>
          ) : (
            preview.history.map((e, i) => (
              <Text key={`${e.round}-${e.kind}-${i}`} wrap="truncate-end">
                <Text dimColor>r{e.round}</Text> {e.kind} <Text color="cyan">{e.agent}</Text>
                {e.sessionName ? ` ${e.sessionName}` : ''}
              </Text>
            ))
          )}
        </Box>
      ) : (
        <Box flexDirection="column">
          {!preview.hasLog || preview.logTail.length === 0 ? (
            <Text dimColor>No log output</Text>
          ) : (
            preview.logTail.map((line, i) => (
              <Text key={i} wrap="truncate-end">
                {line}
              </Text>
            ))
          )}
        </Box>
      )}
      </Box>
      </Box>
    </Box>
  );
}
