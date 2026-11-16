import type { RoomEvent, RoomSeq } from '@rivus/agent-room';

/** What both writers bind: a `RoomEvent`, or a legacy row whose optionals are absent. */
export type InsertableRoomEvent = Omit<RoomEvent, 'addressedTo' | 'origin' | 'wakeDepth'> & {
  addressedTo?: RoomEvent['addressedTo'];
  origin?: RoomEvent['origin'];
  wakeDepth?: RoomEvent['wakeDepth'];
};

/**
 * The `room_events` insert both sqlite stores speak: one prepared statement
 * shape and one row binder, so the initial write and the unit-of-work diff
 * cannot drift.
 */
export function prepareRoomEventInsert(
  db: { prepare(sql: string): { run(...values: unknown[]): unknown } },
  roomId: string,
): { run(event: InsertableRoomEvent, seq: RoomSeq): unknown } {
  const insertEvent = db.prepare(`
      INSERT INTO room_events (
        room_id, seq, message_id, transport_message_id, author_kind, author_id, kind, body, addressed_to, origin, wake_depth, at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  return {
    run(event: InsertableRoomEvent, seq: RoomSeq) {
      return insertEvent.run(
        roomId,
        seq,
        event.messageId,
        event.transportMessageId ?? null,
        event.author.kind,
        event.author.id,
        event.kind,
        event.body,
        JSON.stringify(event.addressedTo ?? []),
        event.origin ?? 'endpoint',
        event.wakeDepth ?? 0,
        event.at,
      );
    },
  };
}
