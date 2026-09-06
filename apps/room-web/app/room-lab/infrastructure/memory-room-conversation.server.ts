import { MemoryRoomStreamStore, type RoomId } from '@rivus/agent-room';
import { StoredRoomConversation } from './stored-room-conversation.server';

const DEFAULT_ROOM_ID: RoomId = { tenantId: 'local', conversationId: 'web-room' };

export class MemoryRoomConversation extends StoredRoomConversation {
  constructor(roomId: RoomId = DEFAULT_ROOM_ID) {
    super(roomId, new MemoryRoomStreamStore());
  }

  override reset(): void {
    this.store = new MemoryRoomStreamStore();
    this.ensureSessions();
  }
}
