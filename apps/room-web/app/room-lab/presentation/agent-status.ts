import type { RoomLabAgentStatus } from '../read-model';

export const agentStatusLabels: Record<RoomLabAgentStatus, string> = {
  idle: '尚未验证', running: '思考中', completed: '已完成', posted: '已回复',
  held: '等待追平', silent: '已读', error: '连接异常',
};
