import type { AgentId, RoomEvent } from '../contracts/types';

export type WakePolicy = 'mention-only' | 'all-human-messages';

/**
 * See ≠ wake. `@` is addressing. Companion posts enter the stream and default
 * do not wake. `wake-on-peer-posts` is reserved and off.
 */
export function shouldWake(input: {
  event: RoomEvent;
  agentId: AgentId;
  policy: WakePolicy;
}): boolean {
  const { event, agentId, policy } = input;
  if (
    event.origin === 'control-plane' ||
    event.kind === 'control-plane' ||
    event.author.kind === 'control-plane'
  ) {
    return false;
  }
  if (event.author.id === agentId) {
    return false;
  }
  if (event.kind === 'companion' || event.author.kind === 'agent') {
    return false;
  }
  if (event.author.kind !== 'human' || event.kind !== 'human') {
    return false;
  }
  if (event.addressedTo.includes(agentId)) {
    return true;
  }
  return policy === 'all-human-messages';
}
