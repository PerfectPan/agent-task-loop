import type {
  AgentSession,
  AgentSessionId,
  RoomAuthor,
  RoomEvent,
  RoomStreamStore,
  SliceBudget,
} from '@rivus/agent-room';
import type { LeaseSnapshot } from '@rivus/agent-kit-collab/lease';
import type { RoomLabAgentId } from '../domain/agent-registry';
import type { RoomTurnView } from '../read-model';
import type { HostedTools } from './tool-server.server';
import type { ToolDefinition, TurnHarness, TurnPermissionPolicy, TurnResult } from './turn';

/** How a turn may carry the record: 50 events, up to 48k characters. */
export const TURN_BUDGET: SliceBudget = { maxEvents: 50, maxChars: 48_000 };

/** HELDs a single turn survives before the tool closes and the turn passes. */
export const HELD_LIMIT = 3;

/**
 * One key per (room, member), shared by the scheduler and the lease:
 * `room:<roomId>:member:<agentId>`.
 */
export function runtimeKey(roomId: string, agentId: RoomLabAgentId): string {
  return `room:${roomId}:member:${agentId}`;
}

/** One member's row, as the control plane reads it from the `agents` table. */
export interface Agent {
  id: RoomLabAgentId;
  label: string;
  /** The ACP command line the agent's profile starts. */
  command: string;
  systemPrompt: string;
  /** The turn watchdog's own bound for this member; the design default otherwise. */
  timeoutMs?: number;
}

/** The control plane's roster port: the `agents` table read and written through it. */
export interface AgentRegistry {
  list(): Promise<Agent[]>;
  get(id: string): Promise<Agent | undefined>;
  save(agent: Agent): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * The scheduler half, as the dispatcher sees it. Implemented over
 * `createLanes` (`@rivus/agent-kit-collab` `/lanes`): a wake asks for one
 * activation of the key, and while one runs or waits, further wakes coalesce
 * into at most one more activation. It never blocks the caller; a failure to
 * ask is observed by the host, not thrown here.
 */
export interface RoomMemberRuntime {
  wake(key: string): void;
  /**
   * Stops a running activation and drops the wakes it owes (a reset cancels
   * the turns it invalidates); a scheduler without a cancel lets them run out.
   */
  cancel?(key: string): void | Promise<void>;
}

/**
 * A room's two cost knobs the protocol reads directly. The bounds that stay at
 * their design defaults (depth ceiling `2n`, round budget `n(n + 1)`) are left
 * unset here and derived where they are used.
 */
export interface RoomSettings {
  wake: 'broadcast' | 'addressed';
  serial: boolean;
  /** Where members work during a turn; undefined means the room's own directory. */
  cwd?: string;
  depthCeiling?: number;
  roundBudget?: number;
}

/** The endpoint's turn log: what the UI reads outcomes and rounds from. */
export interface TurnLog {
  append(record: {
    id: string;
    roomId: string;
    agentId: RoomLabAgentId;
    roundSeq: number;
    triggerSeq: number;
    readUpToSeq: number;
    startedAt: string;
    endedAt?: string;
    outcome?: RoomTurnView['outcome'];
    postedSeq?: number;
    stopReason?: string;
    heldCount?: number;
    error?: string;
  }): void;
  /** A room's turns, oldest first. */
  listByRoom(roomId: string): RoomTurnView[];
  /** A room's rows, gone: a reset clears the log with the record it describes. */
  clear(roomId: string): void;
}

/**
 * The control plane's ToolServer, narrowed to what an activation needs: the
 * member's Room tool definitions made reachable on the endpoint its session
 * carries. The session's first activation hosts the endpoint; later ones
 * re-serve their tools on the same one, so the URL the agent's `session/new`
 * holds stays valid for the session's life.
 */
export interface RoomToolHostInput {
  agentId: RoomLabAgentId;
  /** This activation's Room tools; they replace whatever the endpoint serves. */
  tools: ToolDefinition[];
  /**
   * The endpoint-side registration, consulted per call: true while this
   * activation is the member's open turn. A call without it is refused.
   */
  authorize: () => boolean;
}

export type RoomToolHost = (input: RoomToolHostInput) => Promise<HostedTools>;

/** What the dispatcher needs about the room's members: who is seated, in order. */
export type RoomMembers = () => readonly RoomLabAgentId[];

/**
 * The rows this machine knows, as the endpoint's own columns see them: the
 * desk's roster for the read model and the mention grammar. The control
 * plane's `AgentRegistry` port (system prompt, binding) travels beside it.
 */
export interface AgentDescriptor {
  id: RoomLabAgentId;
  label: string;
  role: string;
  color: number;
}

export type AgentDescriptors = () => readonly AgentDescriptor[];

/** Where the room's settings come from; read fresh so a change applies at once. */
export type RoomSettingsReader = () => RoomSettings;

/**
 * The port surface one RoomService is built on. The record and the write
 * points are `RoomStreamStore` (admit, speak, pass, readSlice); the registry is
 * the control plane's roster port; the turn contract lives in `./turn`.
 */
export type { RoomStreamStore, ToolDefinition, TurnHarness, TurnPermissionPolicy, TurnResult };

/**
 * The record plus the session side-channels the turn reads it with: the
 * cursor a member's inbox starts after, the clear a reset performs, and the
 * endpoint-authored post the private-room gateway makes. The control plane's
 * `LeaseManager` satisfies `RoomLeases`; it is narrowed here so a test can
 * stand in for it.
 */
export interface RoomRecordStore extends RoomStreamStore {
  ensureSession(id: AgentSessionId): AgentSession;
  inspectSession(id: AgentSessionId): AgentSession | undefined;
  clear(): void;
  post(input: {
    messageId: string;
    author: RoomAuthor;
    body: string;
    addressedTo: RoomLabAgentId[];
    wakeDepth: number;
  }): Promise<RoomEvent>;
}

/** The lease half the dispatcher's writes run under (the kit's `/lease`). */
export interface RoomLeases {
  /**
   * Linearizes one external write against every holder of this key: the write
   * runs only while the caller still holds the member lease, and a successor's
   * write starts only after it settled.
   */
  fence<T>(key: string, op: () => Promise<T>): Promise<T>;
  /** The key's lease record, for the member status display. */
  read(key: string): Promise<LeaseSnapshot | undefined>;
}

/**
 * One round's home: the room whose human event opened it. A round spans the
 * private rooms opened inside it (docs/architecture/agent-collaboration.md), so a child room charges its
 * budget and reads its ceiling here instead of keeping its own.
 */
export interface RoomRoundLedger {
  /** Counts one turn against the round; false once the round budget is spent. */
  charge(roundSeq: number): boolean;
  /** The depth ceiling shouldWake measures the round's events against. */
  ceiling(roundSeq: number): number;
  /** The round's one budget-exhausted notice, posted into this room's record. */
  postBudgetNotice(roundSeq: number): void;
}

/**
 * Which room and seq a round is rooted at. A dm post's own room when it opens
 * a round there; the parent room a `dm:` message id names when the round is
 * inherited (docs/architecture/agent-collaboration.md: the round is the causal tree under one human event,
 * wherever its events land).
 */
export interface RoomRound {
  roomId: string;
  seq: number;
}

/**
 * The private-room gateway behind the room_dm tool (docs/architecture/agent-collaboration.md): finds or opens
 * the pair's child room, posts the body there at the trigger's depth plus one,
 * and hands the post to the child room's dispatcher. The host owns it, because
 * the child room is outside this service's own record.
 */
export interface RoomDmGateway {
  open(input: {
    parentRoomId: string;
    from: RoomLabAgentId;
    to: RoomLabAgentId;
    body: string;
    /** The waking event's depth; the child post carries one more. */
    triggerDepth: number;
    /** The parent event whose activation opened or reused the room. */
    triggerSeq: number;
    /** The round the exchange's turns charge, rooted in this room. */
    roundRoomId: string;
    roundSeq: number;
  }): Promise<{ roomId: string; seq: number }>;
}
