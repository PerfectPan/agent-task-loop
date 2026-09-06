import type { RoomLabAgentId } from '../read-model';

export const agentRoleLabels: Record<RoomLabAgentId, string> = {
  'claude-relay': '转述',
  claude: '审核',
  codex: '实施',
  opencode: '搭建',
  dsh: '分析',
};
