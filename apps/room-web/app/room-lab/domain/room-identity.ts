const ROOM_IDENTITY = /^r_[a-f0-9]{10}$/;

export class RoomCatalogInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomCatalogInvariantError';
  }
}

export function isRoomIdentity(value: unknown): value is string {
  return typeof value === 'string' && ROOM_IDENTITY.test(value);
}

export function assertRoomIdentity(value: string): string {
  if (!isRoomIdentity(value)) {
    throw new RoomCatalogInvariantError(`Unknown Room: ${String(value)}`);
  }
  return value;
}
