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

export interface RoomAdmissionStore {
  admit(input: AdmitRoomEvent): Promise<AdmitResult>;
  head(roomId: RoomId): Promise<RoomSeq>;
}

export interface RoomStreamStore extends RoomAdmissionStore {
  readSlice(roomId: RoomId, afterSeq: RoomSeq, budget: SliceBudget): Promise<RoomSlice>;
  replyInSerial(input: RoomReplyCommand): Promise<RoomReplyResult>;
}
