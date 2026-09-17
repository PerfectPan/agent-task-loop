import {
  ROOM_AGENT_ROSTER,
  type RoomLabAgentId,
} from './agent-roster';

const KNOWN_MENTIONS = new Map<string, RoomLabAgentId>(
  ROOM_AGENT_ROSTER.map(agent => [agent.id, agent.id]),
);
/**
 * The one mention grammar. Exported as a source string rather than a RegExp so
 * every reader builds its own object and no one inherits someone else's
 * lastIndex; the composer's string→document rebuild uses it so that what the
 * editor turns into a chip is exactly what the server will read as a mention.
 */
export const ROOM_MENTION_SOURCE = String.raw`(?<![a-z0-9._%+-])@(all|[a-z][a-z-]*)(?=\s|$|[,.!?;:，。！？；：])`;

const MENTION_PATTERN = new RegExp(ROOM_MENTION_SOURCE, 'gi');

export interface RoomMessage {
  body: string;
  addressedTo: RoomLabAgentId[];
  unknownMentions: string[];
  inactiveMentions: RoomLabAgentId[];
}

export function parseRoomMessage(
  body: string,
  activeAgentIds: readonly RoomLabAgentId[] = ROOM_AGENT_ROSTER.map(agent => agent.id),
): RoomMessage {
  const addressedTo = new Set<RoomLabAgentId>();
  const unknownMentions = new Set<string>();
  const inactiveMentions = new Set<RoomLabAgentId>();
  const activeAgents = new Set(activeAgentIds);
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const mention = match[1]?.toLowerCase();
    if (!mention) continue;
    if (mention === 'all') {
      for (const agentId of activeAgentIds) addressedTo.add(agentId);
      continue;
    }
    const agentId = KNOWN_MENTIONS.get(mention);
    if (agentId && activeAgents.has(agentId)) addressedTo.add(agentId);
    else if (agentId) inactiveMentions.add(agentId);
    else unknownMentions.add(mention);
  }
  return {
    body,
    addressedTo: [...addressedTo],
    unknownMentions: [...unknownMentions],
    inactiveMentions: [...inactiveMentions],
  };
}
