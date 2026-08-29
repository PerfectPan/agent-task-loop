import type {
  AdmitResult,
  AdmitRoomEvent,
  RoomId,
  RoomReplyCommand,
  RoomReplyResult,
  RoomSeq,
  RoomSlice,
  SliceBudget,
} from './types';

export interface RoomStreamStore {
  admit(input: AdmitRoomEvent): Promise<AdmitResult>;
  readSlice(roomId: RoomId, afterSeq: RoomSeq, budget: SliceBudget): Promise<RoomSlice>;
  replyInSerial(input: RoomReplyCommand): Promise<RoomReplyResult>;
  head(roomId: RoomId): Promise<RoomSeq>;
}
