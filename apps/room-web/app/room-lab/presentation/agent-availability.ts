import type { RoomAgentAvailability } from '../read-model';

export const agentAvailabilityLabels: Record<RoomAgentAvailability, string> = {
  runnable: '可运行',
  found: '已安装',
  missing: '未安装',
};
