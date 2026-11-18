import React from 'react';
import { Box, Text } from 'ink';
import type { TaskRecord } from '../../types/task';
import { formatDetailFields } from '../logic/format';
import { statusConfig } from '../logic/status';
import { PaneFrame } from './pane-frame';
import { PaneTitle } from './pane-title';

export interface TaskDetailProps {
  task: TaskRecord | null;
  now: number;
  width: number;
  focused: boolean;
  /** Vertical scroll offset in rows (content shifts up by this many lines). */
  scroll?: number;
}

/** Center pane: the selected task's fields plus progress / error sections. */
export function TaskDetail({ task, now, width, focused, scroll = 0 }: TaskDetailProps): React.JSX.Element {
  return (
    <PaneFrame width={width} focused={focused}>
      <PaneTitle focused={focused}>detail{focused && scroll > 0 ? <Text dimColor> ↑{scroll}</Text> : null}</PaneTitle>
      <Box flexGrow={1} flexDirection="column" overflow="hidden" minHeight={0}>
        {!task ? (
          <Text dimColor>Select a task</Text>
        ) : (
          <Box flexDirection="column" flexShrink={0} marginTop={-scroll}>
            <Text bold wrap="truncate-end">
              {task.taskId} {task.title}
            </Text>
            <Box flexDirection="column" marginTop={1}>
              {formatDetailFields(task, now).map((field) => (
                <Box key={field.label}>
                  <Box width={8} flexShrink={0}>
                    <Text dimColor>{field.label}</Text>
                  </Box>
                  <Text color={field.label === '状态' ? statusConfig(task.status).color : undefined}>
                    {field.value}
                  </Text>
                </Box>
              ))}
            </Box>
            {task.progressSummary ? (
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor>进展</Text>
                <Text wrap="wrap">{task.progressSummary}</Text>
              </Box>
            ) : null}
            {task.lastError ? (
              <Box flexDirection="column" marginTop={1}>
                <Text color="red">错误</Text>
                <Text color="red" wrap="wrap">
                  {task.lastError}
                </Text>
              </Box>
            ) : null}
          </Box>
        )}
      </Box>
    </PaneFrame>
  );
}
