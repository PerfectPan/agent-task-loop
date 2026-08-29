export type TenantId = string;
export type ConversationId = string;
export type AgentId = string;
export type RuntimeGenerationId = string;
export type TransportMessageId = string;

/** Monotonic posted sequence. 0 means the room has no events yet. */
export type RoomSeq = number;

export interface RoomId {
  tenantId: TenantId;
  conversationId: ConversationId;
}

export function roomKey(id: RoomId): string {
  return JSON.stringify([id.tenantId, id.conversationId]);
}

export type RoomEventKind = 'human' | 'posted' | 'companion' | 'control-plane';
export type RoomOrigin = 'endpoint' | 'control-plane';

export interface RoomAuthor {
  kind: 'human' | 'agent' | 'control-plane';
  id: string;
}

export interface RoomEvent {
  seq: RoomSeq;
  roomId: RoomId;
  /** Display identifier. Entity identity inside the Room is seq. */
  messageId: string;
  /** Present only for externally admitted events and used for transport deduplication. */
  transportMessageId?: TransportMessageId;
  author: RoomAuthor;
  kind: RoomEventKind;
  body: string;
  origin: RoomOrigin;
  addressedTo: AgentId[];
  at: string;
}

export interface AdmitRoomEvent {
  roomId: RoomId;
  messageId: TransportMessageId;
  author: RoomAuthor;
  kind: RoomEventKind;
  body: string;
  origin?: RoomOrigin;
  addressedTo?: AgentId[];
}

export type AdmitResult =
  | { outcome: 'admitted'; seq: RoomSeq; event: RoomEvent }
  | { outcome: 'duplicate'; seq: RoomSeq; event: RoomEvent };

export interface SliceBudget {
  maxEvents: number;
  maxChars?: number;
}

export interface RoomSlice {
  events: RoomEvent[];
  head: RoomSeq;
}

export interface AgentSessionId {
  tenantId: TenantId;
  agentId: AgentId;
  roomId: RoomId;
  runtimeGenerationId: RuntimeGenerationId;
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
  heldUpToSeq?: RoomSeq;
}

export interface RoomReplyCommand {
  session: AgentSessionId;
  body: string;
  origin?: 'agent' | 'control-plane';
  ackHeldUpToSeq?: RoomSeq;
}

export type RoomReplyResult =
  | { outcome: 'posted'; seq: RoomSeq; event: RoomEvent }
  | { outcome: 'held'; heldUpToSeq: RoomSeq; newer: RoomEvent[] };
