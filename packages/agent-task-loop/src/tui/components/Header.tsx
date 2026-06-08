import React from 'react';
import { Box, Text } from 'ink';
import { timeAgo } from '../logic/format';

/** Props for the dashboard {@link Header} bar. */
export interface HeaderProps {
  /** Active target agent label (e.g. 'claude'). */
  agent: string;
  /** Number of tasks currently in view. */
  taskCount: number;
  /** ISO timestamp of the last successful fetch, or undefined. */
  lastFetchedAt: string | undefined;
  /** Current time as epoch ms (injected clock). */
  now: number;
  /** Active filter query; the filter segment is hidden when empty. */
  filterText?: string;
}

/**
 * Render the single bordered top line of the dashboard: the title, the active
 * agent, the task count, the relative time since the last fetch, and the
 * current filter query when one is set.
 */
export function Header({
  agent,
  taskCount,
  lastFetchedAt,
  now,
  filterText,
}: HeaderProps): React.ReactElement {
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        Agent Task Loop
      </Text>
      <Text> </Text>
      <Text color="green">{agent}</Text>
      <Text> </Text>
      <Text color="yellow">{taskCount}</Text>
      <Text dimColor> updated {timeAgo(lastFetchedAt, now)}</Text>
      {filterText ? <Text color="magenta"> /{filterText}</Text> : null}
    </Box>
  );
}
