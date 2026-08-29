import type {
  AdmitResult,
  AdmitRoomEvent,
  RoomId,
  RoomSeq,
} from './types';

export interface RoomAdmissionStore {
  admit(input: AdmitRoomEvent): Promise<AdmitResult>;
  head(roomId: RoomId): Promise<RoomSeq>;
}
