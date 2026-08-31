export type { AgentSession, AgentSessionId } from './agent-session/domain/model';
export { sessionKey } from './agent-session/domain/model';
export { AgentSessionAggregate } from './agent-session/domain/agent-session';
export {
  AGENT_SESSION_VALIDATION_CODE,
  AgentSessionValidationError,
} from './agent-session/domain/errors';

export type { RoomAdmissionStore, RoomStreamStore } from './room/application/room-stream-store';

export {
  ROOM_VALIDATION_CODE,
  RoomValidationError,
} from './room/domain/errors';

export type {
  AgentId,
  AdmitResult,
  AdmitRoomEvent,
  ConversationId,
  RoomAuthor,
  RoomEvent,
  RoomEventKind,
  RoomId,
  RoomOrigin,
  RoomSeq,
  RoomSlice,
  RuntimeGenerationId,
  SliceBudget,
  TenantId,
  TransportMessageId,
} from './room/domain/model';
export { roomKey } from './room/domain/model';

export { Room } from './room/domain/room';

export {
  MemoryRoomStreamStore,
  createMemoryRoomStreamStore,
  type MemoryRoomStreamStoreOptions,
} from './room/infrastructure/memory-room-stream-store';

export type { RoomReplyCommand, RoomReplyResult } from './room/domain/reply-in-serial';
export type {
  CompleteSilentlyCommand,
  CompleteSilentlyResult,
} from './room/domain/complete-silently-in-serial';
export { shouldWake, type WakePolicy } from './wake/domain/wake-policy';
