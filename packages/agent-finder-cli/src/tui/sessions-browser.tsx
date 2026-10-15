import { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { SessionHead } from '@rivus/agent-kit/sessions';
import { relativeAge } from '../sessions/view.js';
import { sessionIdOf } from '../sessions/list.js';

export interface SessionsBrowserProps {
  sessions: SessionHead[];
  /** The selected session's transcript, as readable preview lines. */
  loadTranscript: (id: string) => Promise<string[]>;
  nowMs: number;
  /** Resolve the resume command for a session, or null when unsupported. */
  loadResume?: (id: string) => Promise<string | null>;
  /** Preview lines to keep (most recent). */
  previewLines?: number;
}

/**
 * Interactive two-pane session browser: a list of sessions on the left and the
 * selected session's transcript preview on the right. ↑/↓ (or k/j) navigate,
 * q/Esc quits.
 */
export function SessionsBrowser({
  sessions,
  loadTranscript,
  nowMs,
  loadResume,
  previewLines = 20,
}: SessionsBrowserProps) {
  const { exit } = useApp();
  const [selected, setSelected] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [resume, setResume] = useState<string | null>(null);
  // Indexing can miss at runtime (empty list, or `selected` past a shrunk list),
  // but noUncheckedIndexedAccess is off — widen locally to keep the guards honest.
  const current = sessions[selected] as SessionHead | undefined;
  const currentId = current ? sessionIdOf(current) : null;

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelected((i) => Math.min(sessions.length - 1, i + 1));
    }
    if (key.upArrow || input === 'k') {
      setSelected((i) => Math.max(0, i - 1));
    }
  });

  useEffect(() => {
    let active = true;
    setLines([]);
    setResume(null);
    if (currentId) {
      loadTranscript(currentId).then(
        (result) => {
          if (active) {
            setLines(result);
          }
        },
        () => {
          /* ignore — preview stays empty */
        },
      );
      loadResume?.(currentId).then(
        (cmd) => {
          if (active) {
            setResume(cmd);
          }
        },
        () => {
          /* ignore — no resume hint */
        },
      );
    }
    return () => {
      active = false;
    };
  }, [currentId, loadTranscript, loadResume]);

  if (sessions.length === 0) {
    return <Text dimColor>No sessions found.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>Sessions ({sessions.length}) — ↑/↓ navigate · q quit</Text>
      <Box>
        <Box flexDirection="column" width={42} marginRight={2}>
          {sessions.map((session, i) => (
            <Text key={session.ref.path} inverse={i === selected} wrap="truncate">
              {session.ref.agent.padEnd(12)} {sessionIdOf(session).slice(0, 8)}{' '}
              {relativeAge(session.lastActiveAt, nowMs)}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Text dimColor wrap="truncate">
            {current?.ref.path ?? ''}
          </Text>
          {resume ? (
            <Text color="green" wrap="truncate">
              resume: {resume}
            </Text>
          ) : null}
          {lines.length === 0 ? (
            <Text dimColor>(no transcript)</Text>
          ) : (
            lines.slice(-previewLines).map((line, i) => (
              <Text key={i} wrap="truncate">
                {line}
              </Text>
            ))
          )}
        </Box>
      </Box>
    </Box>
  );
}
