import { AgentSessionValidationError } from '../contracts/errors';
import type { AgentSession, AgentSessionId, RoomSeq } from '../contracts/types';

/** Aggregate root for one agent runtime generation's cursor and hold state. */
export class AgentSessionAggregate {
  private seen: RoomSeq;
  private held?: RoomSeq;
  private readonly sessionId: AgentSessionId;

  constructor(id: AgentSessionId, state?: Omit<AgentSession, 'id'>) {
    validateSession(id, state);
    this.sessionId = cloneSessionId(id);
    this.seen = state?.seenSeq ?? 0;
    this.held = state?.heldUpToSeq;
  }

  get id(): AgentSessionId {
    return cloneSessionId(this.sessionId);
  }

  get seenSeq(): RoomSeq {
    return this.seen;
  }

  advanceSeen(seq: RoomSeq): void {
    assertSessionSeq(seq, 'seen sequence');
    this.seen = Math.max(this.seen, seq);
    if (this.held !== undefined && this.held <= this.seen) this.held = undefined;
  }

  hold(upToSeq: RoomSeq): void {
    assertSessionSeq(upToSeq, 'hold sequence');
    if (upToSeq <= this.seen) return;
    this.held = Math.max(this.held ?? 0, upToSeq);
  }

  ackHold(upToSeq: RoomSeq): boolean {
    assertSessionSeq(upToSeq, 'hold acknowledgement sequence');
    if (this.held !== upToSeq) return false;
    this.advanceSeen(upToSeq);
    return true;
  }

  recordPost(seq: RoomSeq): void {
    assertSessionSeq(seq, 'posted sequence');
    this.advanceSeen(seq);
    this.held = undefined;
  }

  snapshot(): AgentSession {
    return {
      id: cloneSessionId(this.sessionId),
      seenSeq: this.seen,
      ...(this.held === undefined ? {} : { heldUpToSeq: this.held }),
    };
  }
}

function assertSessionSeq(seq: RoomSeq, label: string): void {
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new AgentSessionValidationError(`${label} must be a non-negative integer`);
  }
}

function validateSession(id: AgentSessionId, state?: Omit<AgentSession, 'id'>): void {
  if (
    !id.tenantId.trim() ||
    !id.agentId.trim() ||
    !id.roomId.tenantId.trim() ||
    !id.roomId.conversationId.trim() ||
    !id.runtimeGenerationId.trim()
  ) {
    throw new AgentSessionValidationError('agent session identity is incomplete');
  }
  if (id.tenantId !== id.roomId.tenantId) {
    throw new AgentSessionValidationError('agent session tenant does not match its room tenant');
  }
  const seenSeq = state?.seenSeq ?? 0;
  assertSessionSeq(seenSeq, 'agent session seenSeq');
  if (state?.heldUpToSeq !== undefined) {
    if (!Number.isSafeInteger(state.heldUpToSeq) || state.heldUpToSeq <= seenSeq) {
      throw new AgentSessionValidationError('agent session hold must be ahead of seenSeq');
    }
  }
}

function cloneSessionId(id: AgentSessionId): AgentSessionId {
  return { ...id, roomId: { ...id.roomId } };
}
