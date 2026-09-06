import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomId } from '@rivus/agent-room';
import { FileRoomStreamStore } from './file-room-stream-store.server';
import { StoredRoomConversation } from './stored-room-conversation.server';

export class FileRoomConversation extends StoredRoomConversation {
  constructor(
    private readonly directory: string,
    roomId: RoomId,
  ) {
    super(roomId, new FileRoomStreamStore(directory, roomId));
  }

  override reset(): void {
    rmSync(join(this.directory, 'events.json'), { force: true });
    rmSync(join(this.directory, 'sessions.json'), { force: true });
    this.store = new FileRoomStreamStore(this.directory, this.roomId);
    this.ensureSessions();
  }
}
