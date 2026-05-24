import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { TaskRecord } from '../types/task';
import { TaskList } from './task-list';
import { TaskDetail } from './task-detail';
import { sortTasks } from './sort';

const REFRESH_INTERVAL = 30;

export function App({ onFetch }: { onFetch: () => Promise<TaskRecord[]> }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await onFetch();
      setTasks(result.slice().sort(sortTasks));
      setSelectedIndex(i => Math.min(i, Math.max(0, result.length - 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setCountdown(REFRESH_INTERVAL);
    }
  }, [onFetch]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          fetchTasks();
          return REFRESH_INTERVAL;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [fetchTasks]);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    } else if (input === 'r') {
      fetchTasks();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(i => Math.min(tasks.length - 1, i + 1));
    }
  });

  const termWidth = stdout?.columns ?? 100;
  const leftWidth = Math.min(36, Math.floor(termWidth * 0.35));
  const rightWidth = termWidth - leftWidth - 2;
  const selectedTask = tasks[selectedIndex];

  return (
    <Box flexDirection="column" width={termWidth}>
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderColor="blue">
        <Text bold color="blue">Agent Task Loop</Text>
        <Text dimColor>  {tasks.length} tasks</Text>
        {isLoading && <Text color="yellow">  refreshing…</Text>}
        <Box flexGrow={1} />
        <Text dimColor>↑↓/jk · r=refresh · q=quit · next {countdown}s</Text>
      </Box>

      {/* Main content */}
      <Box flexDirection="row">
        {/* Left panel: task list */}
        <Box
          width={leftWidth}
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
        >
          <Box paddingX={1}>
            <Text dimColor bold>Tasks</Text>
          </Box>
          <TaskList tasks={tasks} selectedIndex={selectedIndex} />
        </Box>

        {/* Right panel: task detail */}
        <Box
          width={rightWidth}
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
        >
          {error ? (
            <Box paddingX={1} paddingY={1}>
              <Text color="red">Error: {error}</Text>
            </Box>
          ) : selectedTask ? (
            <TaskDetail task={selectedTask} />
          ) : (
            <Box paddingX={1} paddingY={1}>
              <Text dimColor>No task selected</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
