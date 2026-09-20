import type { CountOffSnapshot } from './domain/count-off-run';
import type { RoomLabAgentId } from './domain/agent-registry';

export type { RoomLabAgentId } from './domain/agent-registry';

export type RoomLabAgentStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'posted'
  | 'held'
  | 'silent'
  | 'error';

export interface RoomLabEventView {
  seq: number;
  messageId: string;
  author: {
    kind: 'human' | 'agent' | 'control-plane';
    id: string;
  };
  kind: 'human' | 'posted' | 'companion' | 'control-plane';
  body: string;
  addressedTo: string[];
  at: string;
  pending?: boolean;
  failed?: boolean;
}

/** One shell lookup either resolves a member's command or it does not. */
export type RoomAgentAvailability = 'runnable' | 'missing';

export interface RoomAgentInventoryItem {
  id: RoomLabAgentId;
  label: string;
  role: string;
  /** 1…5, the identity hue stored on the agent's row. */
  color: number;
  availability: RoomAgentAvailability;
  command?: string;
}

/** A seat as the room itself knows it: who is in it and what they did. */
export interface RoomSeatView {
  id: RoomLabAgentId;
  label: string;
  role: string;
  color: number;
  active: boolean;
  status: RoomLabAgentStatus;
  seenSeq: number;
  heldUpToSeq?: number;
  lastDraft?: string;
  latencyMs?: number;
  retryAttempt?: number;
  error?: string;
}

/** The seat plus what this machine knows about the CLI behind it. */
export interface RoomLabAgentView extends RoomSeatView {
  availability: RoomAgentAvailability;
  command?: string;
}

export type RoomLabTaskStatus =
  | 'executing'
  | 'reviewing'
  | 'reworking'
  | 'passed'
  | 'changes-requested'
  | 'failed'
  | 'interrupted';

export interface RoomLabTaskView {
  taskId: string;
  title: string;
  status: RoomLabTaskStatus;
  round: number;
  maxRounds: number;
  allowedSeat: 'impl' | 'review';
  occupied: boolean;
  verdict?: 'PASS' | 'CHANGES_REQUESTED';
  findings?: string;
}

export interface RoomCatalogItemView {
  id: string;
  title: string;
  updatedAt: string;
  lastLine?: string;
  memberCount: number;
}

export interface AgentDeskSeat {
  id: string;
  title: string;
}

export interface AgentDeskItem extends RoomAgentInventoryItem {
  seatedIn: AgentDeskSeat[];
  /** The member's own row; empty when it adds nothing to a turn. */
  systemPrompt: string;
}

export interface AgentDeskView {
  lastOpenedId?: string;
  agents: AgentDeskItem[];
}

/**
 * What one room can state about itself. It knows its transcript and its seats;
 * it does not know the room's title, the other rooms, or which CLIs this
 * machine has — those are the host's, added in `RoomLabHost.decorate`.
 */
export interface RoomView {
  roomId: string;
  epoch: string;
  head: number;
  revision: number;
  busy: boolean;
  runningAgentIds: RoomLabAgentId[];
  activeAgentIds: RoomLabAgentId[];
  events: RoomLabEventView[];
  agents: RoomSeatView[];
  countOff?: CountOffSnapshot;
  task?: RoomLabTaskView;
}

/** The room as a page can render it: the host's facts folded in. */
export interface RoomLabState extends RoomView {
  title: string;
  goal?: string;
  agents: RoomLabAgentView[];
  catalog: RoomCatalogItemView[];
}

export type RoomLabAction =
  | { action: 'message'; body: string; clientMessageId?: string }
  | { action: 'compose'; agentIds: RoomLabAgentId[] }
  | { action: 'count-off' }
  | { action: 'retry'; agentId: RoomLabAgentId }
  | { action: 'task'; title: string }
  | { action: 'create'; title: string; goal?: string; agentIds?: RoomLabAgentId[] }
  | { action: 'reset' };

export type RoomLabActionResponse =
  | { ok: true; state: RoomLabState }
  | { ok: false; error: string };

export class RoomLabStateSelector {
  private readonly retiredEpochs = new Set<string>();

  takeLoader(current: RoomLabState, incoming: RoomLabState): RoomLabState {
    if (incoming.roomId !== current.roomId) return incoming;
    if (incoming.epoch === current.epoch) return takeNewestRoomState(current, incoming);
    if (this.retiredEpochs.has(incoming.epoch)) return current;
    this.retiredEpochs.add(current.epoch);
    return incoming;
  }

  takeAction(current: RoomLabState, incoming: RoomLabState): RoomLabState {
    return takeNewestRoomState(current, incoming);
  }
}

export function takeNewestRoomState(
  current: RoomLabState,
  incoming: RoomLabState,
): RoomLabState {
  if (incoming.roomId !== current.roomId) return current;
  if (incoming.epoch !== current.epoch) return current;
  return incoming.revision > current.revision ? incoming : current;
}
