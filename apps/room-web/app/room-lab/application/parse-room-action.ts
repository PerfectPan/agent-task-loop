import { isRoomLabAgentId } from '../domain/agent-roster';
import type { RoomLabAction } from '../read-model';
import { RoomLabInputError } from './room-lab-service.server';

export function parseRoomAction(value: unknown): RoomLabAction {
  if (!value || typeof value !== 'object' || !('action' in value)) {
    throw new RoomLabInputError('Room action is invalid');
  }
  const input = value as Record<string, unknown>;
  switch (input.action) {
    case 'message':
      if (typeof input.body === 'string') {
        return {
          action: 'message',
          body: input.body,
          ...(typeof input.clientMessageId === 'string'
            ? { clientMessageId: input.clientMessageId }
            : {}),
        };
      }
      break;
    case 'compose':
      if (
        Array.isArray(input.agentIds) &&
        input.agentIds.every(isRoomLabAgentId)
      ) {
        return { action: 'compose', agentIds: input.agentIds };
      }
      break;
    case 'retry':
      if (isRoomLabAgentId(input.agentId)) {
        return { action: 'retry', agentId: input.agentId };
      }
      break;
    case 'count-off':
      return { action: 'count-off' };
    case 'task':
      if (typeof input.title === 'string') return { action: 'task', title: input.title };
      break;
    case 'create':
      if (typeof input.title === 'string') {
        return {
          action: 'create',
          title: input.title,
          ...(typeof input.goal === 'string' ? { goal: input.goal } : {}),
          ...(Array.isArray(input.agentIds) && input.agentIds.every(isRoomLabAgentId)
            ? { agentIds: input.agentIds }
            : {}),
        };
      }
      break;
    case 'reset':
      return { action: 'reset' };
  }
  throw new RoomLabInputError('Room action payload is invalid');
}
