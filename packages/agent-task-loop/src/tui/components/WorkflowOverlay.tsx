import React from 'react';
import { Box, Text } from 'ink';
import type { TaskStatus } from '../../types/task';
import { statusConfig } from '../logic/status';

export interface WorkflowOverlayProps {
  visible: boolean;
  /** The selected task's status, highlighted in the flow. */
  currentStatus?: TaskStatus;
}

/** A coloured status chip; inverse-highlighted when it is the current stage. */
function Chip({ status, active }: { status: TaskStatus; active: boolean }) {
  const cfg = statusConfig(status);
  return (
    <Text color={cfg.color} bold={active} inverse={active}>
      {cfg.glyph} {status}
    </Text>
  );
}

const MAIN: TaskStatus[] = ['待处理', '执行中', '待复核', '待发布', '待验收', '已完成'];

/** Full-screen overlay drawing the task workflow incl. the rework loops. */
export function WorkflowOverlay({ visible, currentStatus }: WorkflowOverlayProps): React.ReactElement | null {
  if (!visible) return null;
  const cur = (s: TaskStatus) => s === currentStatus;
  return (
    <Box flexGrow={1} flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} overflow="hidden">
      <Text bold color="cyan">
        Task workflow
      </Text>

      <Box marginTop={1}>
        <Text dimColor>main path</Text>
      </Box>
      <Text wrap="truncate-end">
        {MAIN.map((s, i) => (
          <Text key={s}>
            {i > 0 ? <Text dimColor> → </Text> : '  '}
            <Chip status={s} active={cur(s)} />
          </Text>
        ))}
      </Text>

      <Box marginTop={1}>
        <Text dimColor>打回 / loops &amp; branches</Text>
      </Box>

      {/* review → rework → re-review cycle */}
      <Text wrap="truncate-end">
        {'  '}
        <Chip status="待复核" active={cur('待复核')} />
        <Text color="red"> ──issues──▶ </Text>
        <Chip status="修复中" active={cur('修复中')} />
        <Text dimColor> ──re-review──▶ </Text>
        <Chip status="待复核" active={false} />
        <Text color="yellow"> ⟲</Text>
      </Text>
      {/* acceptance bounce-back */}
      <Text wrap="truncate-end">
        {'  '}
        <Chip status="待验收" active={cur('待验收')} />
        <Text color="red"> ──changes──▶ </Text>
        <Chip status="修复中" active={cur('修复中')} />
        <Text color="yellow"> ⟲</Text>
      </Text>
      {/* human decision */}
      <Text wrap="truncate-end">
        {'  '}
        <Chip status="执行中" active={cur('执行中')} />
        <Text dimColor> ──needs human──▶ </Text>
        <Chip status="待决策" active={cur('待决策')} />
        <Text dimColor> ──▶ </Text>
        <Chip status="执行中" active={false} />
      </Text>
      {/* terminal failure */}
      <Text wrap="truncate-end">
        {'  '}
        <Text dimColor>any stage ──error──▶ </Text>
        <Chip status="已失败" active={cur('已失败')} />
      </Text>

      <Box marginTop={1}>
        <Text dimColor>Tabs: Active = running/queued · Needs Input = 待决策/待验收 · Done</Text>
      </Box>
      <Text dimColor>press any key to close</Text>
    </Box>
  );
}
