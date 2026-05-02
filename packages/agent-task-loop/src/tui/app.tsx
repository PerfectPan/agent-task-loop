import React from 'react';
import { Box, Text } from 'ink';
import type { TaskRecord } from '../types/task';

export function App({ tasks }: { tasks: TaskRecord[] }) {
  return (
    <Box flexDirection="column">
      <Text color="green">Agent Task Loop</Text>
      {tasks.length === 0 ? (
        <Text color="yellow">No tasks</Text>
      ) : (
        tasks.map(task => (
          <Box key={task.taskId}>
            <Text>{task.taskId}</Text>
            <Text> </Text>
            <Text>{task.title}</Text>
            <Text> </Text>
            <Text color="cyan">P{task.priority}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
