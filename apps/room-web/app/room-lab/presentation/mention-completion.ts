import {
  ROOM_AGENT_ROSTER,
  type RoomLabAgentId,
} from '../domain/agent-roster';

export interface MentionOption {
  id: 'all' | (typeof ROOM_AGENT_ROSTER)[number]['id'];
  label: string;
  description: string;
}

interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

export function buildMentionOptions(activeAgentIds: readonly RoomLabAgentId[]): MentionOption[] {
  const activeAgents = new Set(activeAgentIds);
  return [
    {
      id: 'all',
      label: `All ${activeAgentIds.length} active agents`,
      description: '广播给当前 Room 的全部席位',
    },
    ...ROOM_AGENT_ROSTER
      .filter(agent => activeAgents.has(agent.id))
      .sort((left, right) => activeAgentIds.indexOf(left.id) - activeAgentIds.indexOf(right.id))
      .map(agent => ({
        id: agent.id,
        label: agent.label,
        description: agent.role,
      })),
  ];
}

const defaultOptions = buildMentionOptions(ROOM_AGENT_ROSTER.map(agent => agent.id));

export const mentionCompletion = {
  options: defaultOptions,
  find(value: string, cursor: number): MentionQuery | undefined {
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(^|[\s,.!?;:，。！？；：])@([a-z-]*)$/i);
    if (!match) return undefined;
    const query = match[2] ?? '';
    return {
      start: cursor - query.length - 1,
      end: cursor,
      query: query.toLowerCase(),
    };
  },
  filter(query: string, options: readonly MentionOption[] = defaultOptions): MentionOption[] {
    if (!query) return [...options];
    return options.filter(option =>
      option.id.includes(query) || option.label.toLowerCase().includes(query),
    );
  },
  insert(value: string, query: MentionQuery, option: MentionOption): {
    value: string;
    cursor: number;
  } {
    const mention = `@${option.id} `;
    return {
      value: value.slice(0, query.start) + mention + value.slice(query.end),
      cursor: query.start + mention.length,
    };
  },
};
