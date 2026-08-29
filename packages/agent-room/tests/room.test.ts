import { describe, expect, it } from 'vitest';
import { Room, RoomValidationError } from '../src/index';

const roomId = { tenantId: 'tenant', conversationId: 'conversation' };

describe('Room aggregate', () => {
  it('owns sequence assignment and transport idempotency', () => {
    const room = new Room(roomId);
    const input = {
      roomId,
      messageId: 'm1',
      author: { kind: 'human' as const, id: 'alice' },
      kind: 'human' as const,
      body: 'hello',
    };

    const first = room.admit(input, '2026-08-29T00:00:00.000Z');
    const duplicate = room.admit({ ...input, body: 'changed' }, '2026-08-29T00:01:00.000Z');

    expect(first).toMatchObject({ outcome: 'admitted', seq: 1 });
    expect(duplicate).toEqual({ outcome: 'duplicate', seq: 1, event: first.event });
    expect(room.head).toBe(1);
  });

  it('rejects invalid hydrated streams', () => {
    const room = new Room(roomId);
    const admitted = room.admit(
      {
        roomId,
        messageId: 'm1',
        author: { kind: 'human', id: 'alice' },
        kind: 'human',
        body: 'hello',
      },
      '2026-08-29T00:00:00.000Z',
    );

    expect(() => new Room(roomId, [{ ...admitted.event, seq: 2 }])).toThrow(RoomValidationError);
  });
});
