import React from 'react';
import { Box, Text } from 'ink';
import type { TaskStatus } from '../../types/task';
import { statusConfig } from '../logic/status';

export interface WorkflowOverlayProps {
  visible: boolean;
  /** The selected task's status, highlighted in the flow. */
  currentStatus?: TaskStatus;
}

/** The happy-path pipeline; loops/branches are shown as side notes. */
const FLOW: { status: TaskStatus; en: string; note?: string }[] = [
  { status: '待处理', en: 'queued', note: 'agent claims it' },
  { status: '执行中', en: 'executing', note: '→ 待决策 if a human call is needed' },
  { status: '待复核', en: 'review', note: '⇄ 修复中 — review/rework loops until it passes' },
  { status: '待发布', en: 'publish', note: 'publish-commit / publish-mr' },
  { status: '待验收', en: 'accept', note: '→ 修复中 if changes are requested' },
  { status: '已完成', en: 'done', note: '✗ 已失败 = terminal failure (from any stage)' },
];

function Node({ status, en, note, active }: { status: TaskStatus; en: string; note?: string; active: boolean }) {
  const cfg = statusConfig(status);
  return (
    <Text wrap="truncate-end">
      <Text color={cfg.color}>{cfg.glyph} </Text>
      <Text color={active ? 'cyan' : undefined} bold={active} inverse={active}>
        {status}
      </Text>
      <Text dimColor> {en}</Text>
      {active ? <Text color="cyan" bold>{'  ◀ current'}</Text> : null}
      {note ? <Text dimColor>{'   · ' + note}</Text> : null}
    </Text>
  );
}

/** Full-screen overlay drawing the task workflow, with the current task's stage lit up. */
export function WorkflowOverlay({ visible, currentStatus }: WorkflowOverlayProps): React.ReactElement | null {
  if (!visible) return null;
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      overflow="hidden"
    >
      <Text bold color="cyan">
        Task workflow
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {FLOW.map((stage, i) => (
          <Box key={stage.status} flexDirection="column">
            <Node {...stage} active={stage.status === currentStatus} />
            {i < FLOW.length - 1 ? <Text dimColor>{'    ↓'}</Text> : null}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Tabs group these: Active = running/queued · Needs Input = 待决策/待验收 · Done</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>press any key to close</Text>
      </Box>
    </Box>
  );
}
