import type { RoomLabAgentStatus } from '../read-model';

export const agentStatusLabels: Record<RoomLabAgentStatus, string> = {
  idle: '在场',
  running: '正在写',
  completed: '已完成',
  posted: '已说完',
  held: '被挡住了',
  silent: '已读',
  error: '失败',
};
