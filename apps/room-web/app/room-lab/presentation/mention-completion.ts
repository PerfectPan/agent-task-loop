import type { RoomLabAgentId } from '../read-model';
import { copy } from './copy';

/** What the menu needs about a member: who it is and what colour it wears. */
export interface MentionAgent {
  id: RoomLabAgentId;
  label: string;
  role: string;
  color: number;
}

export interface MentionOption {
  id: 'all' | RoomLabAgentId;
  label: string;
  description: string;
  /** Absent for `@all`, which is the room rather than a member. */
  color?: number;
}

interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

/**
 * The room's own members, in the room's own order, plus `@all`. A member with
 * no matching row still appears under its id: it is addressable because it sits
 * in this room, and the menu is not the place to explain the gap.
 */
export function buildMentionOptions(
  activeAgentIds: readonly RoomLabAgentId[],
  agents: readonly MentionAgent[] = [],
): MentionOption[] {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  return [
    {
      id: 'all',
      label: `All ${activeAgentIds.length} active agents`,
      description: copy.say.everyoneDescription,
    },
    ...activeAgentIds.map(id => {
      const agent = byId.get(id);
      return {
        id,
        label: agent?.label ?? id,
        description: agent?.role ?? '',
        ...(agent ? { color: agent.color } : {}),
      };
    }),
  ];
}

export const mentionCompletion = {
  find(value: string, cursor: number): MentionQuery | undefined {
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(^|[\s,.!?;:，。！？；：])@([a-z0-9-]*)$/i);
    if (!match) return undefined;
    const query = match[2] ?? '';
    return {
      start: cursor - query.length - 1,
      end: cursor,
      query: query.toLowerCase(),
    };
  },
  filter(query: string, options: readonly MentionOption[]): MentionOption[] {
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
