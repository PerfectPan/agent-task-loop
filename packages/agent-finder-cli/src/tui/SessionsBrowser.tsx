import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { Session, TranscriptEntry } from "@rivus/agent-sessions";
import { relativeAge } from "../sessions/view.js";

export interface SessionsBrowserProps {
  sessions: Session[];
  loadTranscript: (id: string) => Promise<TranscriptEntry[]>;
  nowMs: number;
  /** Preview lines to keep (most recent). */
  previewLines?: number;
}

/**
 * Interactive two-pane session browser: a list of sessions on the left and the
 * selected session's transcript preview on the right. ↑/↓ (or k/j) navigate,
 * q/Esc quits.
 */
export function SessionsBrowser({ sessions, loadTranscript, nowMs, previewLines = 20 }: SessionsBrowserProps) {
  const { exit } = useApp();
  const [selected, setSelected] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const current = sessions[selected];

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
      return;
    }
    if (key.downArrow || input === "j") setSelected((i) => Math.min(sessions.length - 1, i + 1));
    if (key.upArrow || input === "k") setSelected((i) => Math.max(0, i - 1));
  });

  useEffect(() => {
    let active = true;
    setTranscript([]);
    if (current) {
      loadTranscript(current.id).then(
        (t) => {
          if (active) setTranscript(t);
        },
        () => {
          /* ignore — preview stays empty */
        }
      );
    }
    return () => {
      active = false;
    };
  }, [current?.id, loadTranscript]);

  if (sessions.length === 0) return <Text dimColor>No sessions found.</Text>;

  return (
    <Box flexDirection="column">
      <Text bold>
        Sessions ({sessions.length}) — ↑/↓ navigate · q quit
      </Text>
      <Box>
        <Box flexDirection="column" width={42} marginRight={2}>
          {sessions.map((session, i) => (
            <Text key={session.id} inverse={i === selected} wrap="truncate">
              {session.agent.padEnd(8)} {session.id.slice(0, 8)} {relativeAge(session.updatedAt, nowMs)}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Text dimColor wrap="truncate">
            {current?.path ?? current?.id ?? ""}
          </Text>
          {transcript.length === 0 ? (
            <Text dimColor>(no transcript)</Text>
          ) : (
            transcript.slice(-previewLines).map((entry, i) => (
              <Text key={i} wrap="truncate">
                {entry.role === "tool" ? `⚙ ${entry.toolName ?? entry.text}` : `${entry.role}: ${entry.text}`}
              </Text>
            ))
          )}
        </Box>
      </Box>
    </Box>
  );
}
