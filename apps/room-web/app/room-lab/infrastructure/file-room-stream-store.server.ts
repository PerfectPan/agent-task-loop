import {
  RoomStreamService,
  type AdmitResult,
  type AdmitRoomEvent,
  type AgentSession,
  type AgentSessionId,
  type CompleteSilentlyCommand,
  type CompleteSilentlyResult,
  type RoomId,
  type RoomReplyCommand,
  type RoomReplyResult,
  type RoomSeq,
  type RoomSlice,
  type SliceBudget,
} from '@rivus/agent-room';
import { FileRoomUnitOfWork } from './file-room-unit-of-work.server';

export class FileRoomStreamStore {
  private readonly unitOfWork: FileRoomUnitOfWork;
  private readonly service: RoomStreamService;

  constructor(directory: string, roomId: RoomId, now: () => number = Date.now) {
    this.unitOfWork = new FileRoomUnitOfWork(directory, roomId);
    this.service = new RoomStreamService(this.unitOfWork, now);
  }

  ensureSession(id: AgentSessionId): AgentSession {
    return this.unitOfWork.ensureSession(id);
  }

  inspectSession(id: AgentSessionId): AgentSession | undefined {
    return this.unitOfWork.inspectSession(id);
  }

  advanceSeen(id: AgentSessionId, seq: RoomSeq): AgentSession {
    return this.unitOfWork.advanceSeen(id, seq);
  }

  ackHold(id: AgentSessionId, heldUpToSeq: RoomSeq): boolean {
    return this.unitOfWork.ackHold(id, heldUpToSeq);
  }

  admit(input: AdmitRoomEvent): Promise<AdmitResult> {
    return this.service.admit(input);
  }

  head(roomId: RoomId): Promise<RoomSeq> {
    return this.service.head(roomId);
  }

  readSlice(roomId: RoomId, afterSeq: RoomSeq, budget: SliceBudget): Promise<RoomSlice> {
    return this.service.readSlice(roomId, afterSeq, budget);
  }

  replyInSerial(input: RoomReplyCommand): Promise<RoomReplyResult> {
    return this.service.replyInSerial(input);
  }

  completeSilentlyInSerial(input: CompleteSilentlyCommand): Promise<CompleteSilentlyResult> {
    return this.service.completeSilentlyInSerial(input);
  }
}
