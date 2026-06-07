import React from 'react';
import { Box, Text } from 'ink';
import type { TaskRecord } from '../../types/task';
import { computeVisibleWindow } from '../logic/viewport';
import { TaskRow } from './TaskRow';

export interface TaskListProps {
  tasks: TaskRecord[];
  selectedIndex: number;
  /** Number of rows the list body can show. */
  visibleRows: number;
  /** Total pane width in columns (incl. border). */
  width: number;
  focused: boolean;
}

/**
 * Bordered task-list pane. Renders only the windowed slice that fits
 * `visibleRows` (manual windowing keeps the live tree height bounded, which is
 * what avoids Ink's full-screen clear/flicker path on long lists).
 */
export function TaskList({
  tasks,
  selectedIndex,
  visibleRows,
  width,
  focused,
}: TaskListProps): React.JSX.Element {
  const { start, end } = computeVisibleWindow(tasks.length, selectedIndex, visibleRows);
  const slice = tasks.slice(start, end);
  // border (2) + marker (2) + badge (2) + id (9) + priority (4) + slack.
  const titleWidth = Math.max(4, width - 2 - 2 - 2 - 9 - 4 - 1);
  const hiddenBelow = tasks.length - end;
  const hiddenAbove = start;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={focused ? 'cyan' : 'gray'}
      borderDimColor={!focused}
      paddingX={1}
    >
      <Text bold color={focused ? 'cyan' : undefined}>
        tasks ({tasks.length})
      </Text>
      {tasks.length === 0 ? (
        <Text color="yellow">No tasks</Text>
      ) : (
        <>
          {hiddenAbove > 0 && <Text dimColor>↑ {hiddenAbove} more</Text>}
          {slice.map((task, i) => (
            <TaskRow
              key={task.taskId}
              task={task}
              selected={start + i === selectedIndex}
              titleWidth={titleWidth}
            />
          ))}
          {hiddenBelow > 0 && <Text dimColor>↓ {hiddenBelow} more</Text>}
        </>
      )}
    </Box>
  );
}
