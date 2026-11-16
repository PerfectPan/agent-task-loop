import type { AgentId, RoomId, RoomSeq, RuntimeGenerationId, TenantId } from '../../room/domain/model';

export interface AgentSessionId {
  tenantId: TenantId;
  agentId: AgentId;
  roomId: RoomId;
  runtimeGenerationId: RuntimeGenerationId;
}

/**
 * The session reads/writes every `RoomStreamStore` facade forwards to its unit
 * of work, as spreadable methods.
 */
export function sessionForwarders(unitOfWork: {
  ensureSession(id: AgentSessionId): AgentSession;
  inspectSession(id: AgentSessionId): AgentSession | undefined;
  advanceSeen(id: AgentSessionId, seq: RoomSeq): AgentSession;
}) {
  return {
    ensureSession: (id: AgentSessionId): AgentSession => unitOfWork.ensureSession(id),
    inspectSession: (id: AgentSessionId): AgentSession | undefined => unitOfWork.inspectSession(id),
    advanceSeen: (id: AgentSessionId, seq: RoomSeq): AgentSession => unitOfWork.advanceSeen(id, seq),
  };
}

/** A defensive copy of a stored session snapshot: the id's nested room id copies too. */
export function cloneSession(session: AgentSession): AgentSession {
  return {
    id: {
      ...session.id,
      roomId: { ...session.id.roomId },
    },
    seenSeq: session.seenSeq,
  };
}

export function sessionKey(id: AgentSessionId): string {
  return JSON.stringify([
    id.tenantId,
    id.agentId,
    id.roomId.tenantId,
    id.roomId.conversationId,
    id.runtimeGenerationId,
  ]);
}

export interface AgentSession {
  id: AgentSessionId;
  seenSeq: RoomSeq;
}
