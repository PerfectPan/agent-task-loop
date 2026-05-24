import React from 'react';
import { Box, Text } from 'ink';
import type { TaskRecord } from '../types/task';
import { StatusIndicator, statusColor } from './status-indicator';

export function TaskList({
  tasks,
  selectedIndex,
}: {
  tasks: TaskRecord[];
  selectedIndex: number;
}) {
  if (tasks.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No tasks</Text>
      </Box>
    );
  }

  return (
    <>
      {tasks.map((task, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={task.taskId}>
            <Text color="cyan">{isSelected ? '▶' : ' '}</Text>
            <Text> </Text>
            <StatusIndicator status={task.status} />
            <Text> </Text>
            <Text color="white" bold={isSelected}>
              {task.taskId}
            </Text>
            <Text> </Text>
            <Text color={statusColor(task.status)} dimColor={!isSelected}>
              {task.targetAgent}
            </Text>
            <Text color="gray">{' P'}{task.priority} </Text>
          </Box>
        );
      })}
    </>
  );
}
