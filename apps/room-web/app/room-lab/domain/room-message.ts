import type { RoomLabAgentId } from './agent-registry';

/**
 * The one mention grammar. Exported as a source string rather than a RegExp so
 * every reader builds its own object and no one inherits someone else's
 * lastIndex; the composer's string→document rebuild uses it so that what the
 * editor turns into a chip is exactly what the server will read as a mention.
 * The word after `@` is an agent id, so it accepts exactly what an id may be.
 */
/** The longest message a room accepts, enforced by the server and shown by the composer. */
export const ROOM_MESSAGE_LIMIT = 2_000;

export const ROOM_MENTION_SOURCE = String.raw`(?<![a-z0-9._%+-])@(all|[a-z][a-z0-9-]*)(?=\s|$|[,.!?;:，。！？；：])`;

const MENTION_PATTERN = new RegExp(ROOM_MENTION_SOURCE, 'gi');

export interface RoomMessage {
  body: string;
  addressedTo: RoomLabAgentId[];
  unknownMentions: string[];
  inactiveMentions: RoomLabAgentId[];
}

/**
 * `knownAgentIds` is the registry: a mention outside it is not an address at
 * all, while one inside it but outside the room is a member who has to be
 * added first. Defaulting to the active crew keeps the two sets in step for
 * callers that have only one of them.
 */
export function parseRoomMessage(
  body: string,
  activeAgentIds: readonly RoomLabAgentId[],
  knownAgentIds: readonly RoomLabAgentId[] = activeAgentIds,
): RoomMessage {
  const addressedTo = new Set<RoomLabAgentId>();
  const unknownMentions = new Set<string>();
  const inactiveMentions = new Set<RoomLabAgentId>();
  const activeAgents = new Set(activeAgentIds);
  const knownAgents = new Set(knownAgentIds);
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const mention = match[1]?.toLowerCase();
    if (!mention) continue;
    if (mention === 'all') {
      for (const agentId of activeAgentIds) addressedTo.add(agentId);
      continue;
    }
    if (activeAgents.has(mention)) addressedTo.add(mention);
    else if (knownAgents.has(mention)) inactiveMentions.add(mention);
    else unknownMentions.add(mention);
  }
  return {
    body,
    addressedTo: [...addressedTo],
    unknownMentions: [...unknownMentions],
    inactiveMentions: [...inactiveMentions],
  };
}
