import {
  ROOM_AGENT_ROSTER,
  type RoomLabAgentId,
} from './agent-roster';

const KNOWN_MENTIONS = new Map<string, RoomLabAgentId>(
  ROOM_AGENT_ROSTER.map(agent => [agent.id, agent.id]),
);
const MENTION_PATTERN = /(?<![a-z0-9._%+-])@(all|[a-z][a-z-]*)(?=\s|$|[,.!?;:，。！？；：])/gi;

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
