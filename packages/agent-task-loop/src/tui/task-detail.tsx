import React from 'react';
import { Box, Text } from 'ink';
import type { TaskRecord } from '../types/task';
import { StatusIndicator } from './status-indicator';

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box marginBottom={1}>
      <Text dimColor>{label.padEnd(12)}</Text>
      {children}
    </Box>
  );
}

export function TaskDetail({ task }: { task: TaskRecord }) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold wrap="wrap">{task.title}</Text>
      </Box>

      <Field label="status">
        <StatusIndicator status={task.status} />
        <Text> {task.status}</Text>
        {task.runnerKind && (
          <Text dimColor>  {task.runnerKind} · round {task.runnerRound ?? 1}</Text>
        )}
      </Field>

      <Field label="agent">
        <Text color="cyan">{task.targetAgent}</Text>
        <Text dimColor>  project </Text>
        <Text>{task.project || '—'}</Text>
        <Text dimColor>  P{task.priority}</Text>
      </Field>

      {task.claimedBy && (
        <Field label="claimed by">
          <Text>{task.claimedBy}</Text>
          {task.claimedAt && <Text dimColor>  {timeAgo(task.claimedAt)}</Text>}
        </Field>
      )}

      {task.progressSummary && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>progress</Text>
          <Box marginLeft={2}>
            <Text wrap="wrap">{task.progressSummary}</Text>
          </Box>
        </Box>
      )}

      {task.resultSummary && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>result</Text>
          <Box marginLeft={2}>
            <Text color="green" wrap="wrap">{task.resultSummary}</Text>
          </Box>
        </Box>
      )}

      {task.lastError && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>error</Text>
          <Box marginLeft={2}>
            <Text color="red" wrap="wrap">{task.lastError}</Text>
          </Box>
        </Box>
      )}

      <Field label="heartbeat">
        <Text dimColor>{timeAgo(task.lastHeartbeatAt)}</Text>
        {task.updatedAt && <Text dimColor>  updated {timeAgo(task.updatedAt)}</Text>}
      </Field>

      {task.prLink && (
        <Field label="PR">
          <Text color="blue">{task.prLink}</Text>
        </Field>
      )}

      {task.workspacePath && (
        <Field label="workspace">
          <Text dimColor>{task.workspacePath}</Text>
        </Field>
      )}
    </Box>
  );
}
