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
}

export function parseRoomMessage(body: string): RoomMessage {
  const addressedTo = new Set<RoomLabAgentId>();
  const unknownMentions = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const mention = match[1]?.toLowerCase();
    if (!mention) continue;
    if (mention === 'all') {
      for (const agent of ROOM_AGENT_ROSTER) addressedTo.add(agent.id);
      continue;
    }
    const agentId = KNOWN_MENTIONS.get(mention);
    if (agentId) addressedTo.add(agentId);
    else unknownMentions.add(mention);
  }
  return {
    body,
    addressedTo: [...addressedTo],
    unknownMentions: [...unknownMentions],
  };
}
