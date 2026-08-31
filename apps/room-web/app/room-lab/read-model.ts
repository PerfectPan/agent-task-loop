import type { CountOffSnapshot } from './domain/count-off-run';
import type { RoomLabAgentId } from './domain/agent-roster';

export type { RoomLabAgentId } from './domain/agent-roster';

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
  author: {
    kind: 'human' | 'agent' | 'control-plane';
    id: string;
  };
  kind: 'human' | 'posted' | 'companion' | 'control-plane';
  body: string;
  addressedTo: string[];
  at: string;
}

export interface RoomLabAgentView {
  id: RoomLabAgentId;
  label: string;
  role: string;
  active: boolean;
  status: RoomLabAgentStatus;
  seenSeq: number;
  heldUpToSeq?: number;
  lastDraft?: string;
  latencyMs?: number;
  retryAttempt?: number;
  error?: string;
}

export type RoomLabTaskStatus =
  | 'executing'
  | 'reviewing'
  | 'reworking'
  | 'passed'
  | 'changes-requested'
  | 'failed';

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

export interface RoomLabState {
  roomId: string;
  epoch: string;
  head: number;
  revision: number;
  busy: boolean;
  activeAgentIds: RoomLabAgentId[];
  events: RoomLabEventView[];
  agents: RoomLabAgentView[];
  countOff?: CountOffSnapshot;
  task?: RoomLabTaskView;
}

export type RoomLabAction =
  | { action: 'message'; body: string }
  | { action: 'compose'; agentIds: RoomLabAgentId[] }
  | { action: 'count-off' }
  | { action: 'retry'; agentId: RoomLabAgentId }
  | { action: 'task'; title: string }
  | { action: 'reset' };

export type RoomLabActionResponse =
  | { ok: true; state: RoomLabState }
  | { ok: false; error: string };

export class RoomLabStateSelector {
  private readonly retiredEpochs = new Set<string>();

  takeLoader(current: RoomLabState, incoming: RoomLabState): RoomLabState {
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
  if (incoming.epoch !== current.epoch) return current;
  return incoming.revision > current.revision ? incoming : current;
}
