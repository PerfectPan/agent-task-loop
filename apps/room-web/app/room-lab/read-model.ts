export type RoomLabAgentId = 'codex' | 'claude';

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
  at: string;
}

export interface RoomLabAgentView {
  id: RoomLabAgentId;
  label: string;
  role: string;
  status: RoomLabAgentStatus;
  seenSeq: number;
  heldUpToSeq?: number;
  lastDraft?: string;
  latencyMs?: number;
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
  head: number;
  revision: number;
  busy: boolean;
  events: RoomLabEventView[];
  agents: RoomLabAgentView[];
  task?: RoomLabTaskView;
}

export type RoomLabAction =
  | { action: 'message'; body: string }
  | { action: 'retry'; agentId: RoomLabAgentId }
  | { action: 'task'; title: string }
  | { action: 'reset' };

export type RoomLabActionResponse =
  | { ok: true; state: RoomLabState }
  | { ok: false; error: string };

export function takeNewestRoomState(
  current: RoomLabState,
  incoming: RoomLabState,
): RoomLabState {
  return incoming.revision > current.revision ? incoming : current;
}
