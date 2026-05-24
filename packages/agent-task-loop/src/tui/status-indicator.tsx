import React from 'react';
import { Text } from 'ink';
import type { TaskStatus } from '../types/task';
import { Spinner } from './spinner';

const STATUS_CONFIG: Record<TaskStatus, { icon: string; color: string; spinning?: boolean }> = {
  '待处理': { icon: '○', color: 'gray' },
  '进行中': { icon: '◉', color: 'yellow' },
  '执行中': { icon: '●', color: 'green', spinning: true },
  '待复核': { icon: '◎', color: 'cyan' },
  '修复中': { icon: '●', color: 'yellow', spinning: true },
  '待决策': { icon: '◆', color: 'magenta' },
  '待发布': { icon: '↑', color: 'blue' },
  '待验收': { icon: '◈', color: 'cyan' },
  '已完成': { icon: '✓', color: 'green' },
  '已失败': { icon: '✗', color: 'red' },
};

export function statusColor(status: TaskStatus): string {
  return STATUS_CONFIG[status]?.color ?? 'white';
}

export function StatusIndicator({ status }: { status: TaskStatus }) {
  const config = STATUS_CONFIG[status] ?? { icon: '?', color: 'white' };
  if (config.spinning) {
    return <Spinner color={config.color} />;
  }
  return <Text color={config.color}>{config.icon}</Text>;
}
