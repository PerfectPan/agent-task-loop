export const ROOM_AGENT_ROSTER = [
  {
    id: 'claude-relay',
    label: 'Claude Relay',
    role: 'Long-form synthesizer',
  },
  {
    id: 'claude',
    label: 'Claude',
    role: 'Critical reviewer',
  },
  {
    id: 'codex',
    label: 'Codex',
    role: 'Implementation lead',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    role: 'Open-source builder',
  },
  {
    id: 'dsh',
    label: 'DSH',
    role: 'DeepSeek analyst',
  },
] as const;

export const ROOM_AGENT_COUNT = ROOM_AGENT_ROSTER.length;

export type RoomLabAgentId = (typeof ROOM_AGENT_ROSTER)[number]['id'];

const ROOM_AGENT_IDS = new Set<string>(ROOM_AGENT_ROSTER.map(agent => agent.id));

export function isRoomLabAgentId(value: unknown): value is RoomLabAgentId {
  return typeof value === 'string' && ROOM_AGENT_IDS.has(value);
}
