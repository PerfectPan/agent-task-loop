import React from 'react';
import { Box, Text } from 'ink';
import type { PreviewMode, SessionPreview as SessionPreviewData } from '../types';
import { runnerLabel } from '../logic/heartbeat';
import { HeartbeatLine } from './heartbeat-line';
import { MetaRow } from './meta-row';
import { ModeTabs } from './mode-tabs';
import { TranscriptEntry } from './transcript-entry';

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
                      <Text dimColor={!selected}>r{e.round}</Text> {e.kind} <Text color="cyan">{e.agent}</Text>
                    </Text>
                  );
                })
              )}
              {focused ? <Text dimColor>{'\n'}[↑↓] round [Enter] open transcript</Text> : null}
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
