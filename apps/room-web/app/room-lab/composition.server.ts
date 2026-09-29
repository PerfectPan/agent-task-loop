import { RoomLabHost } from './application/room-lab-host.server';

declare global {
  var __rivusRoomLabHost: RoomLabHost | undefined;
}

export function getRoomLabHost(): RoomLabHost {
  // Not instanceof: after a hot reload the imported class is a new object and
  // the check would build a second host beside the still-running first one.
  if (!globalThis.__rivusRoomLabHost) {
    globalThis.__rivusRoomLabHost = new RoomLabHost();
  }
  return globalThis.__rivusRoomLabHost;
}

if (import.meta.hot) {
  // The host owns processes and ports — an ACP child per seated member, a
  // tool endpoint per session, lease rows for every running turn — and a hot
  // swap that leaves them behind leaks one of each per reload.
  import.meta.hot.dispose(() => {
    const host = globalThis.__rivusRoomLabHost;
    globalThis.__rivusRoomLabHost = undefined;
    void host?.close();
  });
}
