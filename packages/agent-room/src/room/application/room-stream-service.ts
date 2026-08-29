import type { RoomStreamStore } from './room-stream-store';
import type { RoomUnitOfWork } from './room-unit-of-work';
import type {
  AdmitResult,
  AdmitRoomEvent,
  RoomId,
  RoomSeq,
  RoomSlice,
  SliceBudget,
} from '../domain/model';
import { postControlPlane } from '../domain/post-control-plane';
import { replyInSerial, type RoomReplyCommand, type RoomReplyResult } from '../domain/reply-in-serial';

export class RoomStreamService implements RoomStreamStore {
  constructor(
    private readonly unitOfWork: RoomUnitOfWork,
    private readonly now: () => number,
  ) {}

  async admit(input: AdmitRoomEvent): Promise<AdmitResult> {
    return this.unitOfWork.withRoom(input.roomId, room => room.admit(input, this.isoNow()));
  }

  async head(roomId: RoomId): Promise<RoomSeq> {
    return this.unitOfWork.readRoom(roomId, room => room.head);
  }

  async readSlice(roomId: RoomId, afterSeq: RoomSeq, budget: SliceBudget): Promise<RoomSlice> {
    return this.unitOfWork.readRoom(roomId, room => room.readSlice(afterSeq, budget));
  }

  async replyInSerial(input: RoomReplyCommand): Promise<RoomReplyResult> {
    if (input.origin === 'control-plane') {
      return this.unitOfWork.withRoom(input.session.roomId, room =>
        postControlPlane(room, input.session, input.body, this.isoNow()),
      );
    }
    return this.unitOfWork.withRoomAndSession(input.session, (room, session) =>
      replyInSerial(
        room,
        session,
        {
          body: input.body,
          ...(input.ackHeldUpToSeq === undefined ? {} : { ackHeldUpToSeq: input.ackHeldUpToSeq }),
        },
        this.isoNow(),
      ),
    );
  }

  private isoNow(): string {
    return new Date(this.now()).toISOString();
  }
}
