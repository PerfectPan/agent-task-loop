import type {
  AdmitResult,
  AdmitRoomEvent,
  RoomId,
  RoomSeq,
  RoomSlice,
  SliceBudget,
} from '../domain/model';
import type { RoomReplyCommand, RoomReplyResult } from '../domain/reply-in-serial';

export interface RoomAdmissionStore {
  admit(input: AdmitRoomEvent): Promise<AdmitResult>;
  head(roomId: RoomId): Promise<RoomSeq>;
}

export interface RoomStreamStore extends RoomAdmissionStore {
  readSlice(roomId: RoomId, afterSeq: RoomSeq, budget: SliceBudget): Promise<RoomSlice>;
  replyInSerial(input: RoomReplyCommand): Promise<RoomReplyResult>;
}
