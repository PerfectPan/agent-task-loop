import React from 'react';
import { Box, Text } from 'ink';
import type { TaskRecord } from '../../types/task';
import { statusConfig } from '../logic/status';
import { formatPriority } from '../logic/format';
import { truncateToWidth } from '../logic/truncate';
import { BADGE_WIDTH, PRIORITY_WIDTH, TASK_ID_WIDTH } from '../logic/layout';
import { Spinner } from './Spinner';

export interface TaskRowProps {
  task: TaskRecord;
  selected: boolean;
  /** Display width budget for the title cell (CJK-aware). */
  titleWidth: number;
}

/**
 * One line of the task list. Memoized so a single poll tick that changes one
 * task re-renders only that row, not the whole list — the comparator looks at
 * the primitives that actually affect the rendered output.
 */
function TaskRowImpl({ task, selected, titleWidth }: TaskRowProps): React.JSX.Element {
  const cfg = statusConfig(task.status);
  const title = truncateToWidth(task.title, Math.max(1, titleWidth));

  return (
    <Box>
      <Text>{selected ? '❯ ' : '  '}</Text>
      <Box width={BADGE_WIDTH} flexShrink={0}>
        {cfg.live ? <Spinner color={cfg.color} /> : <Text color={cfg.color}>{cfg.glyph}</Text>}
      </Box>
      <Box width={TASK_ID_WIDTH} flexShrink={0}>
        <Text color="cyan" dimColor={!selected}>
          {truncateToWidth(task.taskId, TASK_ID_WIDTH)}
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text bold={selected} inverse={selected} wrap="truncate">
          {title}
        </Text>
      </Box>
      <Box width={PRIORITY_WIDTH} flexShrink={0} justifyContent="flex-end">
        <Text color="gray">{formatPriority(task.priority)}</Text>
      </Box>
    </Box>
  );
}

export const TaskRow = React.memo(
  TaskRowImpl,
  (a, b) =>
    a.selected === b.selected &&
    a.titleWidth === b.titleWidth &&
    a.task.taskId === b.task.taskId &&
    a.task.status === b.task.status &&
    a.task.title === b.task.title &&
    a.task.priority === b.task.priority,
);

TaskRow.displayName = 'TaskRow';
