import type { RoomReplyCommand, RoomReplyResult } from '../contracts/types';
import { sessionKey } from '../contracts/types';
import type { AgentSessionAggregate } from './agent-session';
import type { Room } from './room';

export function replyInSerial(input: {
  room: Room;
  session: AgentSessionAggregate;
  command: RoomReplyCommand;
  at: string;
}): RoomReplyResult {
  if (input.command.origin === 'control-plane') {
    const event = input.room.post(
      {
        messageId: `control:${sessionKey(input.command.session)}:${input.room.head + 1}`,
        author: { kind: 'control-plane', id: input.command.session.agentId },
        kind: 'control-plane',
        body: input.command.body,
        origin: 'control-plane',
        addressedTo: [],
      },
      input.at,
    );
    return { outcome: 'posted', seq: event.seq, event };
  }

  if (input.command.ackHeldUpToSeq !== undefined) {
    input.session.ackHold(input.command.ackHeldUpToSeq);
  }
  const newer = input.room.eventsAfter(input.session.seenSeq, input.command.session.agentId);
  if (newer.length > 0) {
    const heldUpToSeq = newer.at(-1)!.seq;
    input.session.hold(heldUpToSeq);
    return { outcome: 'held', heldUpToSeq, newer };
  }

  const event = input.room.post(
    {
      messageId: `posted:${sessionKey(input.command.session)}:${input.room.head + 1}`,
      author: { kind: 'agent', id: input.command.session.agentId },
      kind: 'posted',
      body: input.command.body,
      origin: 'endpoint',
      addressedTo: [],
    },
    input.at,
  );
  input.session.recordPost(event.seq);
  return { outcome: 'posted', seq: event.seq, event };
}
