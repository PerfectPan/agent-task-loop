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
  /** Selected round in the history list (cursor position). */
  roundIndex?: number;
  /** Transcript lines for the selected round (shown in transcript mode). */
  transcript?: string[];
  /** Whether the selected round's transcript is still loading. */
  transcriptLoading?: boolean;
  /** Session ids that have a transcript on disk (rounds are marked accordingly). */
  availableIds?: ReadonlySet<string>;
}

const MODE_LABELS: Record<PreviewMode, string> = {
  output: 'output',
  history: 'history',
  logs: 'transcript',
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

const ROLE_STYLE: Record<string, { color: string; icon: string }> = {
  user: { color: 'cyan', icon: '▌' },
  assistant: { color: 'green', icon: '▌' },
  reasoning: { color: 'magenta', icon: '·' },
};

/** Render one parsed transcript line as a chat-style block (role header + body). */
function TranscriptEntry({ line }: { line: string }) {
  if (line.startsWith('⚙')) {
    return (
      <Box marginBottom={1}>
        <Text color="yellow" wrap="truncate-end">
          {line}
        </Text>
      </Box>
    );
  }
  const sep = line.indexOf(': ');
  const role = sep > 0 ? line.slice(0, sep) : '';
  const style = ROLE_STYLE[role];
  if (!style) {
    return (
      <Box marginBottom={1}>
        <Text wrap="wrap">{line}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={style.color} bold>
        {style.icon} {role}
      </Text>
      <Text wrap="wrap">{line.slice(sep + 2)}</Text>
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
  roundIndex = 0,
  transcript = [],
  transcriptLoading = false,
  availableIds,
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
            <Text dimColor>No rounds</Text>
          ) : (
            preview.history.map((e, i) => {
              const selected = focused && i === roundIndex;
              const viewable = !!e.sessionId && (availableIds?.has(e.sessionId) ?? false);
              return (
                <Text key={`${e.round}-${e.kind}-${i}`} wrap="truncate-end">
                  <Text color={selected ? 'cyan' : undefined}>{selected ? '❯ ' : '  '}</Text>
                  <Text color={viewable ? 'green' : 'gray'}>{viewable ? '●' : '○'} </Text>
                  <Text dimColor={!selected}>r{e.round}</Text> {e.kind}{' '}
                  <Text color="cyan">{e.agent}</Text>
                </Text>
              );
            })
          )}
          {focused ? <Text dimColor>{'\n'}[↑↓] round  [Enter] open transcript</Text> : null}
        </Box>
      ) : (
        <Box flexDirection="column">
          {(() => {
            const round = preview.history[roundIndex];
            return (
              <>
                <Text wrap="truncate-end">
                  {round ? (
                    <Text dimColor>
                      r{round.round} {round.kind} {round.agent}
                    </Text>
                  ) : (
                    <Text dimColor>transcript</Text>
                  )}
                </Text>
                {transcriptLoading ? (
                  <Text dimColor>Loading…</Text>
                ) : transcript.length === 0 ? (
                  <Text dimColor>Transcript not found on this machine</Text>
                ) : (
                  transcript.map((line, i) => <TranscriptEntry key={i} line={line} />)
                )}
              </>
            );
          })()}
        </Box>
      )}
      </Box>
      </Box>
    </Box>
  );
}
