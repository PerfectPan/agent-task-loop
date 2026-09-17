import type { RoomLabAgentStatus } from '../read-model';

/**
 * Status → what the person reads. The read-model words never reach the
 * screen. "held" is a draft waiting for the member to re-read the room, so it
 * is named as a draft, not as a blockage.
 */
export const agentStatusLabels: Record<RoomLabAgentStatus, string> = {
  idle: '在场',
  running: '正在生成',
  completed: '说完了',
  posted: '说完了',
  held: '草稿待唤醒',
  silent: '读了，没说话',
  error: '没跑起来',
};

export type StatusTone = 'quiet' | 'run' | 'held' | 'err';

export const agentStatusTone: Record<RoomLabAgentStatus, StatusTone> = {
  idle: 'quiet',
  running: 'run',
  completed: 'quiet',
  posted: 'quiet',
  held: 'held',
  silent: 'quiet',
  error: 'err',
};

export const toneDot: Record<StatusTone, string> = {
  quiet: 'bg-success-foreground',
  run: 'bg-info-foreground',
  held: 'bg-warning-foreground',
  err: 'bg-destructive',
};

export const toneText: Record<StatusTone, string> = {
  quiet: 'text-muted-foreground',
  run: 'text-info-foreground',
  held: 'text-warning-foreground',
  err: 'text-destructive',
};
