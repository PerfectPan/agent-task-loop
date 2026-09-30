import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentSessionId, RoomEvent, RoomId, RoomSeq } from '@rivus/agent-room';
import { shouldWake } from '@rivus/agent-room';
import {
  isLockFresh,
  nodeLiveness,
  runtimeKey,
  type AgentRegistry,
  type Harness,
  type PermissionPolicy,
  type SessionUpdate,
  type ToolDefinition,
} from '@rivus/agent-orchestration';
import type { HostedTools } from '@rivus/agent-orchestration/acp';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import path from 'node:path';
import { copy } from '../copy';
import type { RoomLabEventView, RoomLabAgentId, RoomSeatView, RoomTurnView, RoomView } from '../read-model';
import { deriveMemberStatus } from '../read-model';
import { ROOM_MESSAGE_LIMIT, parseRoomMessage } from '../domain/room-message';
import {
  TURN_BUDGET,
  type AgentDescriptors,
  type RoomDmGateway,
  type RoomLeases,
  type RoomMemberRuntime,
  type RoomMembers,
  type RoomRecordStore,
  type RoomRound,
  type RoomRoundLedger,
  type RoomSettingsReader,
  type RoomToolHost,
  type TurnLog,
} from './ports';
import { roomSpeakTool, roomReadTool, roomDmTool, type RoomTurnHandle } from './room-tools.server';
import { dmRoundOf } from './room-dm.server';
import { defaultRoomHome } from '../infrastructure/room-home.server';

/** Every ACP session this endpoint opens belongs to one runtime generation. */
const RUNTIME_GENERATION = 'web-v1';

/** A stale lease row reads as "not running"; the design's own staleness window. */
const LEASE_STALE_MS = 120_000;

/** The actor behind the notices the dispatcher posts into the record. */
function controlActor(roomId: RoomId): AgentSessionId {
  return {
    tenantId: roomId.tenantId,
    agentId: 'room',
    roomId,
    runtimeGenerationId: RUNTIME_GENERATION,
  };
}

interface RoundBudgetState {
  /** Seated members when the round opened; `n` of the two bound defaults. */
  n: number;
  /** Turns this round has already started, seeded from the log on first touch. */
  turns: number;
}

interface OpenTurn {
  handle: RoomTurnHandle;
  /** Set by a reset: the record this turn is running against is going away. */
  invalidated?: boolean;
}

export interface RoomServiceOptions {
  roomId: RoomId;
  /** The record, its write points and the session cursors. */
  store: RoomRecordStore;
  /** The control plane's roster; each member's row carries its own prompt. */
  registry: AgentRegistry;
  runtime: RoomMemberRuntime;
  /** The fence every turn write runs under; the runtime holds the lease. */
  lease: RoomLeases;
  turnLog: TurnLog;
  /** Seat order, read fresh so a compose applies to the next round. */
  members: RoomMembers;
  /** Every row the desk knows, for the read model and the mention grammar. */
  agents: AgentDescriptors;
  settings: RoomSettingsReader;
  roomTitle: () => string;
  /** Where per-room work directories live; defaults to this machine's home. */
  workRoot?: () => string;
  toolHost?: RoomToolHost;
  /** The private-room gateway behind the room_dm tool; the host owns it. */
  dm?: RoomDmGateway;
  /** Set on a private room: what the turn's facts call the room it hangs under. */
  parentTitle?: () => string;
  /**
   * The round ledgers of the other rooms a dm root may name. A child room
   * charges its inherited rounds there (docs/architecture/agent-collaboration.md: a round spans its children).
   */
  ledgerOf?: (roomId: string) => RoomRoundLedger;
  /**
   * The rooms hanging under this one, so a round's lazy budget seed counts
   * the turns their members already spent on it.
   */
  childRooms?: () => readonly string[];
  /**
   * A child room's service, so a reset clears children the same way it
   * clears this room — record, cursors, log, running turns — rather than
   * only their turn rows. The host wires it; tests may stub it.
   */
  resetChild?: (roomId: string) => { reset(): Promise<unknown> } | undefined;
}

/**
 * The endpoint's dispatcher and turn assembly (docs/architecture/agent-collaboration.md): `admit` computes the
 * wake set and calls `runtime.wake`, the runtime answers with `activate` —
 * which builds the turn's Harness: the member's prompt, the room facts, the
 * inbox, the three Room tools, the permission policy — and `afterTurn` passes
 * when nothing was spoken and writes the turn log. No state is kept between
 * turns beyond the round budgets, so there is no workspace snapshot to persist.
 */
export class RoomService {
  private readonly epoch = randomUUID();
  private revision = 0;
  private readonly rounds = new Map<number, RoundBudgetState>();
  private readonly budgetNotices = new Set<number>();
  /**
   * The serial switch's queue — the room's, not each round's. Every entry
   * carries the round its wake was dispatched for; a later round's message
   * waits behind the running turn instead of running beside it.
   */
  private readonly serialQueue: { round: RoomRound; agentId: RoomLabAgentId }[] = [];
  /** A wake issued whose activation has not opened its turn yet. */
  private wakeInFlight = false;
  private readonly openTurns = new Map<RoomLabAgentId, OpenTurn>();
  /** Members whose running turn has already called a tool. */
  private readonly toolCallSeen = new Set<RoomLabAgentId>();

  constructor(private readonly options: RoomServiceOptions) {}

  /** This room's own id as a round root names it. */
  private get homeRoomId(): string {
    return this.options.roomId.conversationId;
  }

  /**
   * The human admit: validate, append at depth 0 (idempotent on the transport
   * message id), then wake. It returns at once — the turns it started run on
   * the runtime, not in this call.
   */
  async sendMessage(body: string, clientMessageId?: string): Promise<RoomView> {
    const message = validateText(body, 'Message');
    const messageId = validateMessageId(clientMessageId) ?? `web:${randomUUID()}`;
    const seats = this.options.members();
    const known = this.options.agents().map((agent) => agent.id);
    const parsed = parseRoomMessage(message, seats, known);
    if (parsed.unknownMentions.length > 0) {
      const mentions = parsed.unknownMentions.map((mention) => `@${mention}`).join(', ');
      throw new RoomInputError(`Unknown Room mention: ${mentions}`);
    }
    if (parsed.inactiveMentions.length > 0) {
      const mentions = parsed.inactiveMentions.map((mention) => `@${mention}`).join(', ');
      throw new RoomInputError(`Add these agents to the Room before mentioning them: ${mentions}`);
    }
    const admitted = await this.options.store.admit({
      roomId: this.options.roomId,
      messageId,
      author: { kind: 'human', id: 'director' },
      kind: 'human',
      body: parsed.body,
      addressedTo: parsed.addressedTo,
    });
    if (admitted.outcome === 'admitted') {
      this.touch();
      this.openRound(admitted.event);
      this.dispatch(admitted.event);
    }
    return this.snapshot();
  }

  /**
   * The runtime asks for the input when a wake becomes an activation: the
   * inbox after the member's cursor, bounded, and the Harness around it.
   */
  async activate(agentId: RoomLabAgentId): Promise<Harness> {
    const roomId = this.options.roomId;
    const session = this.sessionId(agentId);
    this.options.store.ensureSession(session);

    const agent = await this.options.registry.get(agentId);
    if (!agent) {
      throw new Error(`no agent ${agentId} in the registry`);
    }

    const record = await this.options.store.readSlice(roomId, 0, {
      maxEvents: Number.MAX_SAFE_INTEGER,
    });
    const head = record.head;
    const cursor = this.options.store.inspectSession(session)?.seenSeq ?? 0;
    const unread = record.events.filter((event) => event.seq > cursor);
    const inbox = boundedInbox(unread);
    // The cursor moves only over what the turn actually carried. A truncated
    // inbox leaves the rest ahead of it: `room_read` brings the events in,
    // a later speak is HELD against what was never read, and the pass stands
    // on the last seq the member saw (docs/architecture/agent-collaboration.md: seeing is not speaking).
    const readUpToSeq = inbox.at(-1)?.seq ?? cursor;
    const inboxTruncated = unread.length - inbox.length;
    const trigger = record.events.at(-1);
    if (!trigger) {
      throw new Error(`room ${roomId.conversationId} has no record to read`);
    }
    const round = this.resolveRound(record.events, head);
    this.touch();

    const settings = this.options.settings();
    const cwd = this.resolveCwd(settings);
    const turn: OpenTurn = {
      handle: {
        agentId,
        session,
        roomId,
        roundSeq: round.seq,
        ...(round.roomId === this.homeRoomId ? {} : { roundRoomId: round.roomId }),
        triggerSeq: head,
        readUpToSeq,
        spoke: false,
        heldCount: 0,
        closed: false,
        startedAt: new Date().toISOString(),
      },
    };
    const wakeKey = runtimeKey(roomId.conversationId, agentId);
    const lease = this.options.lease;

    let hosted: HostedTools | undefined;
    if (this.options.toolHost) {
      // Closed the moment the turn ends — or the moment a reset invalidates
      // it: an invalidated turn must not speak, read or dm into the record
      // that replaced the one it was running against. The gate is also the
      // tool endpoint's authorize, so all three tools close together.
      const isOpen = () => this.openTurns.get(agentId) === turn && !turn.invalidated;
      const tools: ToolDefinition[] = [
        roomSpeakTool(turn.handle, {
          isOpen,
          speak: async (input) => {
            const result = await lease.fence(wakeKey, () => this.options.store.speak({ session, ...input }));
            // The chain's second wave: a member's post dispatches exactly as
            // the human admit does. The turn already resolved the round the
            // post belongs to — hand it over, so a restart mid-round cannot
            // strand the post in a round of its own.
            if (result.outcome === 'posted') {
              this.dispatch(result.event, round);
            }
            return result;
          },
        }),
        roomReadTool(turn.handle, {
          isOpen,
          read: (input) =>
            this.options.store.readSlice(roomId, input.afterSeq, {
              maxEvents: input.limit ?? 50,
              maxChars: 48_000,
            }),
        }),
      ];
      // A private room offers no room_dm: its two members are already alone,
      // and the room a dm between them would open hangs one level further
      // down, where the person never sees it (docs/architecture/agent-collaboration.md: private rooms hang
      // under the room they were opened from, one level).
      if (this.options.dm && !this.options.parentTitle) {
        const gateway = this.options.dm;
        tools.push(
          roomDmTool(turn.handle, {
            isOpen,
            dm: (input) => {
              if (!this.options.members().includes(input.to)) {
                return Promise.resolve({ error: 'dm-not-a-member' });
              }
              return gateway.open({
                parentRoomId: roomId.conversationId,
                from: agentId,
                to: input.to,
                body: input.body,
                triggerDepth: trigger.wakeDepth,
                triggerSeq: head,
                roundRoomId: round.roomId,
                roundSeq: round.seq,
              });
            },
          }),
        );
      }
      // Tools live with the member's session: the first activation hosts the
      // endpoint and its `session/new` carries it; every later activation
      // re-serves its tools on the same endpoint, because ACP carries
      // `mcpServers` only on `session/new`. The gate keeps the per-turn
      // authorization: a call passes only while this activation is the
      // member's open turn.
      hosted = await this.options.toolHost({ agentId, tools, authorize: isOpen });
    }

    this.openTurns.set(agentId, turn);
    this.wakeInFlight = false;
    const harness: Harness = {
      cwd,
      ...(agent.systemPrompt.trim() ? { systemPrompt: agent.systemPrompt } : {}),
      blocks: turnBlocks({
        agentId,
        label: agent.label,
        seatIndex: this.options.members().indexOf(agentId) + 1,
        seatCount: this.options.members().length,
        roomTitle: this.options.roomTitle(),
        members: this.options.members(),
        inbox,
        ...(inboxTruncated > 0 ? { inboxTruncated } : {}),
        trigger,
        ...(this.options.parentTitle ? { parent: this.options.parentTitle() } : {}),
      }),
      tools: hosted ? [hosted.endpoint] : [],
      permissions: cwdPermissionPolicy(cwd),
      hooks: {
        onUpdate: (update) => this.onUpdate(agentId, update),
        // The promise comes back: the runtime awaits it before it releases
        // the lease, so the pass's fenced cursor write lands inside the held
        // window (docs/architecture/agent-collaboration.md: prompt, afterTurn, release).
        afterTurn: (result) => this.afterTurn(turn, result),
      },
    };
    return harness;
  }

  /** One member's turn ended; the runtime hands the outcome over here. */
  private async afterTurn(
    turn: OpenTurn,
    result: { stopReason: string | null; timedOut: boolean; error?: string },
  ): Promise<void> {
    const handle = turn.handle;
    this.openTurns.delete(handle.agentId);

    // Nothing spoken: the write point is pass, fenced so a lost lease lands
    // nothing. Events past what the turn read stay ahead of the cursor; the
    // pending-wake rule brings the member back for them. A turn a reset
    // invalidated passes nowhere: its seq numbers belong to a record that is
    // gone, and the new record's events stay unread.
    let passError: string | undefined;
    if (!handle.spoke && !turn.invalidated) {
      const wakeKey = runtimeKey(handle.roomId.conversationId, handle.agentId);
      try {
        await this.options.lease.fence(wakeKey, () =>
          this.options.store.pass({ session: handle.session, readUpToSeq: handle.readUpToSeq }),
        );
      } catch (error) {
        // The cursor write did not land. A silent loss here would re-send
        // this turn's inbox on the next wake, so the log and the turn row
        // both carry it.
        passError = errorText(error);
        console.error(`room ${handle.roomId.conversationId}: pass lost for @${handle.agentId}: ${passError}`);
      }
    }
    // The runtime reports `stopReason: null` both for a turn its watchdog
    // ended and for a prompt that died another way; `timedOut` is what
    // separates a timeout from a failure, and a pass that lost its cursor
    // write fails the row, however cleanly the prompt itself ended. A turn
    // the reset invalidated fails with why, whatever it managed to do.
    const resetError = turn.invalidated ? 'room was reset during this turn' : undefined;
    const error = [result.error, passError, resetError].filter(Boolean).join('; ') || undefined;
    const outcome =
      handle.spoke && !turn.invalidated ? 'posted' : result.timedOut ? 'timeout' : error ? 'failed' : 'passed';
    this.options.turnLog.append({
      id: randomUUID(),
      roomId: handle.roomId.conversationId,
      agentId: handle.agentId,
      // A turn the reset invalidated charges no round: its round died with
      // the record it ran against, and the rows that land after the clear
      // must not eat the budget of the rounds that follow the reset.
      roundSeq: turn.invalidated ? 0 : handle.roundSeq,
      triggerSeq: handle.triggerSeq,
      readUpToSeq: handle.readUpToSeq,
      startedAt: handle.startedAt,
      endedAt: new Date().toISOString(),
      outcome,
      ...(handle.postedSeq === undefined ? {} : { postedSeq: handle.postedSeq }),
      ...(result.stopReason === null ? {} : { stopReason: result.stopReason }),
      heldCount: handle.heldCount,
      ...(error ? { error } : {}),
    });
    // The hosted endpoint stays up: it belongs to the member's session, whose
    // next turn re-serves its tools on it. The gate closed above — the turn
    // left `openTurns` — so calls are refused from here on (docs/architecture/agent-collaboration.md: a
    // turn's tools stop working when the turn ends).
    this.toolCallSeen.delete(handle.agentId);
    this.touch();

    // The serial switch starts the next wake only now that this activation
    // ended and its writes have landed.
    this.wakeNextInQueue();
  }

  /**
   * The runtime's answer to an activation of this room's member that died
   * before it was a turn — no lease, no agent row, no harness. The row keeps
   * the failure from reading as 在场, and the serial queue moves on: every
   * activation ends somewhere, and this is one of the ends.
   */
  activationFailed(agentId: RoomLabAgentId, error: string): void {
    this.openTurns.delete(agentId);
    this.wakeInFlight = false;
    this.options.turnLog.append({
      id: randomUUID(),
      roomId: this.homeRoomId,
      agentId,
      // No round was ever resolved: the row says the activation never became
      // a turn, and round 0 is never a round a budget counts.
      roundSeq: 0,
      triggerSeq: 0,
      readUpToSeq: 0,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      outcome: 'failed',
      error,
    });
    this.touch();
    this.wakeNextInQueue();
  }

  /** A member's state for the person: derived, never stored. */
  async snapshot(): Promise<RoomView> {
    const roomId = this.options.roomId;
    const slice = await this.options.store.readSlice(roomId, 0, {
      maxEvents: 200,
      maxChars: 200_000,
    });
    const turns = this.options.turnLog.listByRoom(roomId.conversationId);
    const seats = new Set(this.options.members());
    const agents: RoomSeatView[] = this.options.agents().map((definition) => {
      const leaseHeld = this.leaseHeld(definition.id);
      const last = lastTurnFor(turns, definition.id);
      return {
        id: definition.id,
        label: definition.label,
        role: definition.role,
        color: definition.color,
        active: seats.has(definition.id),
        seenSeq: this.options.store.inspectSession(this.sessionId(definition.id))?.seenSeq ?? 0,
        status: deriveMemberStatus({
          leaseHeld,
          toolCallSeen: this.toolCallSeen.has(definition.id),
          lastOutcome: last?.outcome,
        }),
        ...(last?.error ? { error: last.error } : {}),
      };
    });
    return {
      roomId: roomId.conversationId,
      epoch: this.epoch,
      head: slice.head,
      revision: this.revision,
      activeAgentIds: this.options.members().slice(),
      events: slice.events.map((event) => this.eventView(event)),
      agents,
      turns: turns.slice(-50),
    };
  }

  /**
   * Clears the record, the cursors, the turn log and the round bookkeeping —
   * this room's and, via the host's wiring, its children's — and stops the
   * turns still running against the old record. Seating and settings are
   * kept.
   */
  async reset(): Promise<RoomView> {
    // A turn still running speaks or passes against a record that is about to
    // be empty: mark it so its end neither posts into the new record nor
    // moves a cursor over events it never read, then cancel it.
    for (const turn of this.openTurns.values()) {
      turn.invalidated = true;
      void this.options.runtime.cancel?.(runtimeKey(this.options.roomId.conversationId, turn.handle.agentId));
    }
    this.options.store.clear();
    this.options.turnLog.clear(this.homeRoomId);
    // A round spans its children: a child reset halfway — rows gone, record
    // kept — leaves its turns charging this room through dm roots whose seqs
    // the new record will reuse. Each child resets whole: record, cursors,
    // log, its own running turns, its own children.
    for (const childId of this.options.childRooms?.() ?? []) {
      const child = this.options.resetChild?.(childId);
      if (child) {
        await child.reset();
      } else {
        this.options.turnLog.clear(childId);
      }
    }
    this.rounds.clear();
    this.budgetNotices.clear();
    this.serialQueue.length = 0;
    this.wakeInFlight = false;
    for (const agentId of this.options.members()) {
      this.options.store.ensureSession(this.sessionId(agentId));
    }
    this.touch();
    return this.snapshot();
  }

  /**
   * The dispatcher: who should look at this event, the room's wake mode and
   * budget applied, then `runtime.wake` — one at a time in seat order when the
   * room is serial, concurrently otherwise. The private-room gateway calls it
   * for the post it made in a child room, and a member's own `room_speak` for
   * the post it just landed; a round a dm post opened belongs to the room its
   * message id names, and charges that room's budget (docs/architecture/agent-collaboration.md: a round spans
   * the private rooms opened inside it).
   *
   * `turnRound` is the round the dispatching turn already resolved its record
   * into — the one fact about a member post the event itself does not carry.
   */
  dispatch(event: RoomEvent, turnRound?: RoomRound): void {
    const seats = this.options.members();
    const settings = this.options.settings();
    const round: RoomRound =
      event.kind === 'human' && event.wakeDepth === 0
        ? { roomId: this.homeRoomId, seq: event.seq }
        : (dmRoundOf(event) ?? turnRound ?? { roomId: this.homeRoomId, seq: this.roundOfCached(event.seq) });
    const local = round.roomId === this.homeRoomId;
    const ceiling = local ? this.ceiling(round.seq) : this.roundLedger(round).ceiling(round.seq);
    let wanted = seats.filter((memberId) => shouldWake({ event, memberId, ceiling }));
    if (settings.wake === 'addressed' && event.addressedTo.length > 0) {
      wanted = wanted.filter((memberId) => event.addressedTo.includes(memberId));
    }
    if (settings.serial) {
      // One wake per member: a member already queued for an earlier round has
      // not run yet, so its single activation will read both rounds'
      // messages — the entry is re-tagged to the newer round it was
      // dispatched for, which is also the budget it charges. Without the
      // re-tag, a dedupe by member alone would leave the newer round's wake
      // inside an entry that dies with the older round's budget.
      for (const memberId of wanted) {
        const queued = this.serialQueue.find((entry) => entry.agentId === memberId);
        if (queued) {
          queued.round = round;
          continue;
        }
        this.serialQueue.push({ round, agentId: memberId });
      }
      this.wakeNextInQueue();
      return;
    }
    for (const memberId of wanted) {
      if (!this.chargeRound(round)) {
        this.notifyRound(round);
        return;
      }
      this.options.runtime.wake(runtimeKey(this.options.roomId.conversationId, memberId));
    }
  }

  /** The round ledger of the room a round is rooted in; this room for its own. */
  private roundLedger(round: RoomRound): RoomRoundLedger {
    if (round.roomId === this.homeRoomId) {
      return this;
    }
    if (!this.options.ledgerOf) {
      throw new Error(`room ${this.homeRoomId} has no ledger for the round in ${round.roomId}`);
    }
    return this.options.ledgerOf(round.roomId);
  }

  private chargeRound(round: RoomRound): boolean {
    return this.roundLedger(round).charge(round.seq);
  }

  private notifyRound(round: RoomRound): void {
    this.roundLedger(round).postBudgetNotice(round.seq);
  }

  /**
   * Serial mode: wake the queue's head, one activation at a time. The queue
   * is the room's — a second round's members wait behind the running turn
   * rather than waking beside it — and the gate is the room's too: any open
   * turn, or a wake whose activation has not opened one yet, holds the line.
   * Every activation ends somewhere that calls back here: afterTurn, a
   * reset, an activation that failed before it was a turn.
   */
  private wakeNextInQueue(): void {
    while (this.serialQueue.length > 0) {
      if (this.openTurns.size > 0 || this.wakeInFlight) {
        return;
      }
      const entry = this.serialQueue[0]!;
      if (!this.chargeRound(entry.round)) {
        // The round is spent: its remaining entries go together, with the
        // round's one notice, and the queue moves to whatever follows.
        const spent = entry.round;
        for (let index = this.serialQueue.length - 1; index >= 0; index -= 1) {
          if (roundKey(this.serialQueue[index]!.round) === roundKey(spent)) {
            this.serialQueue.splice(index, 1);
          }
        }
        this.notifyRound(spent);
        continue;
      }
      this.serialQueue.shift();
      this.wakeInFlight = true;
      this.options.runtime.wake(runtimeKey(this.options.roomId.conversationId, entry.agentId));
      return;
    }
  }

  /**
   * A human admit opens its round: the seat count now is the `n` of both
   * budget defaults. A round this process never saw is seeded lazily from the
   * turn log, so a restart mid-round does not reset what was already spent.
   */
  private openRound(event: RoomEvent): void {
    this.rounds.delete(event.seq);
    this.budgetNotices.delete(event.seq);
    const seeded = this.roundBudget(event.seq);
    seeded.n = this.options.members().length;
  }

  private roundBudget(roundSeq: number): RoundBudgetState {
    let state = this.rounds.get(roundSeq);
    if (!state) {
      const rooms = [this.homeRoomId, ...(this.options.childRooms?.() ?? [])];
      state = {
        n: this.options.members().length,
        turns: rooms.reduce(
          (count, roomId) =>
            count + this.options.turnLog.listByRoom(roomId).filter((turn) => turn.roundSeq === roundSeq).length,
          0,
        ),
      };
      this.rounds.set(roundSeq, state);
    }
    return state;
  }

  private budgetAllows(roundSeq: number): boolean {
    const round = this.roundBudget(roundSeq);
    const budget = this.options.settings().roundBudget ?? round.n * (round.n + 1);
    return round.turns < budget;
  }

  /**
   * This room as the ledger child rooms charge (docs/architecture/agent-collaboration.md): counts one turn
   * against the round, and answers whether the wake may start. The count
   * happens synchronously before `runtime.wake`: concurrent wakes never pass
   * through `activate` before the rest of the dispatch loop has run, so a
   * count taken there would always read zero. A wake that collapses into a
   * pending flag still spent its charge — the budget is a cost ceiling, not an
   * exact ledger.
   */
  charge(roundSeq: number): boolean {
    if (!this.budgetAllows(roundSeq)) {
      return false;
    }
    this.roundBudget(roundSeq).turns += 1;
    return true;
  }

  /** The round's depth ceiling here: the room's own setting, else the `2n` default. */
  ceiling(roundSeq: number): number {
    return this.options.settings().depthCeiling ?? 2 * this.roundBudget(roundSeq).n;
  }

  /** The budget's one notice per round; a person's next message opens a new one. */
  postBudgetNotice(roundSeq: number): void {
    if (this.budgetNotices.has(roundSeq)) {
      return;
    }
    this.budgetNotices.add(roundSeq);
    void this.options.store
      .speak({
        session: controlActor(this.options.roomId),
        body: copy.say.roundBudgetReached,
        addressedTo: [],
        readUpToSeq: 0,
        triggerSeq: 0,
        origin: 'control-plane',
      })
      .then(() => this.touch());
  }

  /**
   * The round `head` sits in: the nearest human root at or below it, or — in a
   * private room — the round the nearest dm root names (docs/architecture/agent-collaboration.md). Events
   * above the newest root belong to that root's round, wherever the root's
   * room is.
   */
  private resolveRound(events: RoomEvent[], head: RoomSeq): RoomRound {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!;
      if (event.seq > head) {
        continue;
      }
      if (event.kind === 'human') {
        return { roomId: this.homeRoomId, seq: event.seq };
      }
      const dm = dmRoundOf(event);
      if (dm) {
        return dm;
      }
    }
    return { roomId: this.homeRoomId, seq: 0 };
  }

  /** Cached round lookup for an event this service has already read. */
  private roundOfCached(seq: number): number {
    const known = [...this.rounds.keys()].sort((left, right) => right - left);
    return known.find((roundSeq) => roundSeq <= seq) ?? seq;
  }

  private resolveCwd(settings: ReturnType<RoomSettingsReader>): string {
    const root = (this.options.workRoot ?? defaultWorkRoot)();
    const directory = settings.cwd ?? join(root, this.options.roomId.conversationId);
    mkdirSync(directory, { recursive: true });
    return directory;
  }

  private sessionId(agentId: RoomLabAgentId): AgentSessionId {
    return {
      tenantId: this.options.roomId.tenantId,
      agentId,
      roomId: this.options.roomId,
      runtimeGenerationId: RUNTIME_GENERATION,
    };
  }

  private leaseHeld(agentId: RoomLabAgentId): boolean {
    const record = this.options.lease.read(runtimeKey(this.options.roomId.conversationId, agentId));
    if (!record) {
      return false;
    }
    return isLockFresh(record, Date.now(), LEASE_STALE_MS, (pid) => nodeLiveness.isAlive(pid));
  }

  private onUpdate(agentId: RoomLabAgentId, update: SessionUpdate): void {
    if (update.sessionUpdate === 'tool_call_update') {
      this.toolCallSeen.add(agentId);
    }
  }

  private eventView(event: RoomEvent): RoomLabEventView {
    return {
      seq: event.seq,
      messageId: event.messageId,
      author: { ...event.author },
      kind: event.kind,
      body: event.body,
      addressedTo: [...event.addressedTo],
      at: event.at,
    };
  }

  private touch(): void {
    this.revision += 1;
  }
}

export class RoomInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomInputError';
  }
}

/**
 * The newest unread events that fit one turn's budget, oldest first. The first
 * unread event is always taken even when it alone exceeds the character
 * budget — a member that cannot read the event ahead of its cursor could
 * never advance it; anything over budget comes back through `room_read`.
 */
function boundedInbox(unread: RoomEvent[]): RoomEvent[] {
  const events: RoomEvent[] = [];
  let chars = 0;
  for (const event of unread) {
    if (events.length >= TURN_BUDGET.maxEvents) {
      break;
    }
    if (events.length > 0 && TURN_BUDGET.maxChars !== undefined && chars + event.body.length > TURN_BUDGET.maxChars) {
      break;
    }
    events.push(event);
    chars += event.body.length;
  }
  return events;
}

/**
 * The turn prompt (docs/architecture/agent-collaboration.md): the room facts as one block, the inbox one line
 * per event, the instruction as the last. The member's own system prompt
 * travels in the Harness's native channel, so it is not a block here.
 */
function turnBlocks(input: {
  agentId: RoomLabAgentId;
  label: string;
  seatIndex: number;
  seatCount: number;
  roomTitle: string;
  members: readonly RoomLabAgentId[];
  inbox: RoomEvent[];
  /** Unread events the budget left out of the inbox, when it cut any. */
  inboxTruncated?: number;
  trigger: RoomEvent;
  /** Set in a private room: the title of the room it was opened from. */
  parent?: string;
}): ContentBlock[] {
  const facts =
    `You are @${input.agentId} (${input.label}), member ${input.seatIndex} of ${input.seatCount}` +
    ` in room "${input.roomTitle}".` +
    (input.parent ? ` This is a private room under "${input.parent}".` : '') +
    ` Members in seat order: ${input.members.map((member) => `@${member}`).join(', ')}.` +
    ` You were woken by seq ${input.trigger.seq} from @${input.trigger.author.id}.`;
  const lastShown = input.inbox.at(-1)?.seq;
  const transcript =
    input.inbox.length === 0
      ? '(nothing new since your last turn)'
      : input.inbox.map((event) => inboxLine(event, input.agentId)).join('\n') +
        (input.inboxTruncated && lastShown !== undefined
          ? `\n(${input.inboxTruncated} more unread events follow seq ${lastShown}; call room_read to read them before you speak.)`
          : '');
  const instruction =
    'Read first. If you have something to add, call room_speak once.' +
    ' To settle something with one member alone, call room_dm instead.' +
    ' If not, end your turn without calling either.' +
    ' Text you print without a Room tool is not sent.';
  return [
    { type: 'text', text: facts },
    { type: 'text', text: transcript },
    { type: 'text', text: instruction },
  ];
}

/**
 * The transcript, one line per event, with the reader's own lines marked. The
 * mark sits on each line rather than in a sentence above them, so it survives
 * the transcript being cut at either end.
 */
function inboxLine(event: RoomEvent, selfId: RoomLabAgentId): string {
  const author = event.author.id === selfId ? `@${event.author.id} (you)` : `@${event.author.id}`;
  const addressed = event.addressedTo.length > 0 ? ` → ${event.addressedTo.map((id) => `@${id}`).join(', ')}` : '';
  return `[seq ${event.seq}] ${author}${addressed}: ${event.body}`;
}

/**
 * The default policy for a Room turn: writes inside `cwd` are allowed, writes
 * outside it are denied. Paths are resolved before the comparison — a symlink
 * pointing out of `cwd` is out of `cwd` — and a write-kind call that names no
 * location is denied rather than assumed harmless.
 */
function cwdPermissionPolicy(cwd: string): PermissionPolicy {
  const root = realPathOf(cwd) ?? cwd;
  return (request) => {
    const call = request.toolCall;
    const paths = (call.locations ?? [])
      .map((location) => location.path)
      .filter((value): value is string => typeof value === 'string');
    const writeKind = call.kind === 'edit' || call.kind === 'delete' || call.kind === 'move';
    // A relative path would resolve against this server's cwd — a place the
    // room never named — and a chain the walker gives up on is exactly where
    // the OS would follow it out of the root; both are denied.
    const outside = paths.some((candidate) => {
      if (!path.isAbsolute(candidate)) {
        return true;
      }
      const resolved = resolvedTarget(candidate);
      return resolved === undefined || !isInside(root, resolved);
    });
    const wanted =
      outside || (writeKind && paths.length === 0) ? ['reject_once', 'reject_always'] : ['allow_once', 'allow_always'];
    for (const kind of wanted) {
      const option = request.options.find((candidate) => candidate.kind === kind);
      if (option) {
        return { outcome: 'selected', optionId: option.optionId };
      }
    }
    return { outcome: 'cancelled' };
  };
}

function isInside(root: string, target: string): boolean {
  const within = path.relative(root, target);
  // `..` and `..`-prefixed components only: a name that merely starts with
  // two dots (`..foo`) is an ordinary in-root name.
  return within === '' || (within !== '..' && !within.startsWith(`..${path.sep}`) && !path.isAbsolute(within));
}

function realPathOf(target: string): string | undefined {
  try {
    return realpathSync(target);
  } catch {
    return undefined;
  }
}

/**
 * Where a call's path really points, symlinks included: every component is
 * walked and each link followed, so a link that lives inside the root but
 * points out is judged by where it points. Past the first component that
 * does not exist nothing below can exist either — there is no link left to
 * hide in — so the rest hangs off the last real directory as written.
 * Returns undefined when the walk gives up: an unreadable link, or a chain
 * long enough to be a loop — the caller denies, because handing such a path
 * to the OS is exactly how it would follow the rest of the way out.
 */
function resolvedTarget(target: string): string | undefined {
  let current = path.resolve(target);
  for (let hops = 0; hops < 40; hops += 1) {
    const parts = current.split(path.sep);
    let walked: string = path.sep;
    let followed = false;
    for (let index = 1; index < parts.length; index += 1) {
      const part = parts[index]!;
      if (!part) {
        continue;
      }
      const next = path.join(walked, part);
      let stat: { isSymbolicLink(): boolean };
      try {
        stat = lstatSync(next);
      } catch {
        return path.join(walked, ...parts.slice(index).filter(Boolean));
      }
      if (!stat.isSymbolicLink()) {
        walked = next;
        continue;
      }
      let linkTarget: string;
      try {
        linkTarget = readlinkSync(next);
      } catch {
        return undefined;
      }
      // The link's own target may hold links of its own: walk it next pass,
      // with the rest of the original path hanging off it.
      const rest = parts.slice(index + 1).filter(Boolean);
      current = path.join(path.isAbsolute(linkTarget) ? linkTarget : path.resolve(walked, linkTarget), ...rest);
      followed = true;
      break;
    }
    if (!followed) {
      return walked;
    }
  }
  return undefined;
}

function defaultWorkRoot(): string {
  return join(defaultRoomHome(), 'work');
}

function validateText(value: string, label: string): string {
  const text = value.trim();
  if (!text) {
    throw new RoomInputError(`${label} is required`);
  }
  if (text.length > ROOM_MESSAGE_LIMIT) {
    throw new RoomInputError(`${label} must be at most ${ROOM_MESSAGE_LIMIT} characters`);
  }
  return text;
}

function validateMessageId(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^[A-Za-z0-9:_-]{8,80}$/.test(value)) {
    throw new RoomInputError('Message id is invalid');
  }
  return value;
}

function lastTurnFor(turns: RoomTurnView[], agentId: RoomLabAgentId): RoomTurnView | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!;
    if (turn.agentId === agentId && turn.outcome) {
      return turn;
    }
  }
  return undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Two rounds of the same seq in two rooms are two rounds; the key says whose. */
function roundKey(round: RoomRound): string {
  return `${round.roomId}#${round.seq}`;
}
