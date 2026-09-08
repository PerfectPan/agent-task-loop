import { RoomLabHost } from './application/room-lab-host.server';

declare global {
  var __rivusRoomLabHost: RoomLabHost | undefined;
}

export function getRoomLabHost(): RoomLabHost {
  if (!(globalThis.__rivusRoomLabHost instanceof RoomLabHost)) {
    globalThis.__rivusRoomLabHost = new RoomLabHost();
  }
  return globalThis.__rivusRoomLabHost;
}
