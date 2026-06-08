import React from 'react';
import { Box, Text } from 'ink';
import { TASK_STATUSES, type TaskStatus } from '../../types/task';
import { statusConfig } from '../logic/status';
import { displayWidth } from '../logic/truncate';

export interface WorkflowOverlayProps {
  visible: boolean;
  /** The selected task's status, highlighted in the flow. */
  currentStatus?: TaskStatus;
}

/** Pad `s` with spaces up to display column `col` (CJK-aware). */
function padTo(s: string, col: number): string {
  const gap = col - displayWidth(s);
  return gap > 0 ? s + ' '.repeat(gap) : s;
}

/**
 * Build the workflow as one connected ASCII diagram. The happy path runs down
 * the left; the review⇄rework loop is drawn as a real arc back to 待复核.
 */
function buildDiagram(): string[] {
  const L3prefix = '  ◎ 待复核 ──── issues ────▶ ';
  const colRework = displayWidth(L3prefix); // where ● 修复中 sits
  const colReview = 2; // the ┌ column, directly above 待复核

  // Top arc closing the review⇄rework loop: ┌ above 待复核, ┐ above 修复中.
  const label = ' re-review ◀ ';
  const inner = Math.max(1, colRework - colReview - 1);
  const dash = Math.max(0, inner - displayWidth(label));
  const left = Math.floor(dash / 2);
  const arcTop =
    padTo('', colReview) + '┌' + '─'.repeat(left) + label + '─'.repeat(dash - left) + '┐';

  return [
    '  ◌ 待处理',
    '  ▼',
    '  ● 执行中 ──needs human──▶ ◆ 待决策',
    '  ▼',
    arcTop,
    L3prefix + '● 修复中',
    '  ▼ pass',
    '  ↑ 待发布',
    '  ▼',
    '  ◈ 待验收 ──── changes ────▶ ● 修复中',
    '  ▼ accept',
    '  ✓ 已完成        ✗ 已失败  (任意阶段都可能失败)',
  ];
}

const DIAGRAM = buildDiagram();
const STATUS_RE = new RegExp(`(${TASK_STATUSES.join('|')})`, 'g');

/** Render one diagram line, colouring status tokens (inverse for the current one). */
function DiagramLine({ line, current }: { line: string; current?: TaskStatus }) {
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

/** Full-screen overlay drawing the task workflow as one connected diagram. */
export function WorkflowOverlay({ visible, currentStatus }: WorkflowOverlayProps): React.ReactElement | null {
  if (!visible) return null;
  return (
    <Box flexGrow={1} flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} overflow="hidden">
      <Text bold color="cyan">
        Task workflow
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {DIAGRAM.map((line, i) => (
          <DiagramLine key={i} line={line} current={currentStatus} />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Tabs: Active = running/queued · Needs Input = 待决策/待验收 · Done · press any key to close</Text>
      </Box>
    </Box>
  );
}
