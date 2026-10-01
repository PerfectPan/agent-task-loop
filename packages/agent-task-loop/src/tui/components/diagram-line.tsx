import React from 'react';
import { Text } from 'ink';
import { TASK_STATUSES, type TaskStatus } from '../../types/task';
import { statusConfig } from '../logic/status';

const STATUS_RE = new RegExp(`(${TASK_STATUSES.join('|')})`, 'g');

/** Render one diagram line, colouring status tokens (inverse for the current one). */
export function DiagramLine({ line, current }: { line: string; current?: TaskStatus }): React.JSX.Element {
  const parts = line.split(STATUS_RE);
  return (
    <Text wrap="truncate-end">
      {parts.map((part, i) => {
        if ((TASK_STATUSES as readonly string[]).includes(part)) {
          const status = part as TaskStatus;
          const active = status === current;
          return (
            <Text key={i} color={statusConfig(status).color} bold={active} inverse={active}>
              {part}
            </Text>
          );
        }
        return (
          <Text key={i} dimColor>
            {part}
          </Text>
        );
      })}
    </Text>
  );
}
