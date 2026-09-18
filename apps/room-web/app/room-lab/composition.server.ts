import { RoomLabService } from './application/room-lab-service.server';
import { runLocalAgent } from './infrastructure/local-agent-runner.server';
import { MemoryRoomConversation } from './infrastructure/memory-room-conversation.server';
import { LocalTaskDelivery } from './infrastructure/local-task-delivery.server';
import { LocalTextPresenter } from './infrastructure/local-text-presenter.server';

declare global {
  var __rivusRoomLabService: RoomLabService | undefined;
}

export function getRoomLabService(): RoomLabService {
  globalThis.__rivusRoomLabService ??= new RoomLabService({
    conversation: new MemoryRoomConversation(),
    agentRunner: runLocalAgent,
    taskDelivery: new LocalTaskDelivery(),
    textPresenter: new LocalTextPresenter(),
  });
  return globalThis.__rivusRoomLabService;
}
