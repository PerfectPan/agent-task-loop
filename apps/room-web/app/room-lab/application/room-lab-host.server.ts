import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { join } from 'node:path';
import {
  FileSessionBindingStoreLive,
  type AcpConnection,
  type AcpSessionHandle,
  type SessionBindingStore,
} from '@rivus/agent-kit/acp';
import { NodePlatformLive } from '@rivus/agent-kit/node/effect';
import type { PlatformService } from '@rivus/agent-kit/platform/effect';
import { createLanes, type ActivationExit, type Lanes } from '@rivus/agent-kit-collab/lanes';
import type { LeaseLost, LeaseManager, LeaseRepository, LeaseRepositoryFailure } from '@rivus/agent-kit-collab/lease';
import { make as makeManagedRuntime, type ManagedRuntime } from 'effect/ManagedRuntime';
import * as Cause from 'effect/Cause';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Ref from 'effect/Ref';
import * as Scope from 'effect/Scope';
import { RoomService, RoomInputError } from './room-service.server';
import { RoomDm } from './room-dm.server';
import type { RoomMemberRuntime, ToolDefinition, TurnHarness, TurnResult } from './ports';
import { runtimeKey } from './ports';
import { ToolServer, type HostedTools } from './tool-server.server';
import { createRoomRecordInput, defaultWorkRoot, nowIso } from '../infrastructure/room-home.server';
import {
  connectRoomAgent,
  openRoomSession,
  probeRoomAgent,
  runTurnStream,
  type RoomAgentProbe,
  type RoomAgentSpec,
  type TurnStreamOutcome,
} from '../infrastructure/agent-acp.server';
import { createRoomLeaseManager, roomLeasePath, roomLeaseRepositoryLayer } from '../infrastructure/room-lease.server';
import { ActiveRoomLeases } from '../infrastructure/room-leases.server';
import { SqliteRoomStore } from '../infrastructure/sqlite-room-store.server';
import { SqliteAgentRegistry } from '../infrastructure/sqlite-agent-registry.server';
import { SqliteTurnLog } from '../infrastructure/sqlite-turn-log.server';
import { INHERITED_AGENT_ROLE } from '../infrastructure/agent-seed.server';
import { RoomCatalog, RoomCatalogInvariantError, type RoomWakeMode } from '../domain/room-catalog';
import { isAgentId, type AgentRegistry, type RoomLabAgentId } from '../domain/agent-registry';
import {
  deriveAgentAvailability,
  type AgentDeskView,
  type RoomAgentProbeItem,
  type RoomCatalogItemView,
  type RoomLabAction,
  type RoomLabState,
  type RoomView,
} from '../read-model';

export interface RoomLabHostBindings {
  /** Test seam: answer a row's probe without starting an ACP process. */
  probe?: (agent: RoomAgentSpec) => Promise<RoomAgentProbe>;
}

/**
 * `room:<roomId>:member:<agentId>` back into its two ids. The split is the
 * last `:member:` marker, so a room id containing colons still parses.
 */
function parseRuntimeKey(key: string): { roomId: string; agentId: RoomLabAgentId } {
  const marker = ':member:';
  const at = key.lastIndexOf(marker);
  if (at === -1 || !key.startsWith('room:')) {
    throw new Error(`runtime key ${key} does not name a room member`);
  }
  return {
    roomId: key.slice('room:'.length, at),
    agentId: key.slice(at + marker.length) as RoomLabAgentId,
  };
}

/** Runs a synchronous step, sending a throw down the error channel. */
function attempt<A>(fn: () => A): Effect.Effect<A, unknown> {
  return Effect.suspend(() => {
    try {
      return Effect.succeed(fn());
    } catch (cause) {
      return Effect.fail(cause);
    }
  });
}

/**
 * The turn bound the collaboration design puts on one activation, also the
 * lanes' own backstop: the design bounds a turn at 10 minutes, and an agent
 * row may set a shorter `timeoutMs` for its member. The lane backstop cuts a
 * turn whose own watchdog somehow never fired.
 */
const TURN_TIMEOUT_MS = 600_000;
/** Activations that may run at once across every room of this host. */
const LANES_MAX_CONCURRENT = 16;
/** Keys that may wait for a free slot; a lane waits at most once. */
const LANES_MAX_QUEUED = 64;

/**
 * An activation that failed after its turn had ended — the turn row was
 * written by afterTurn, so the failure only tells the host to discard the
 * process the turn ran on, not to report a failed activation.
 */
class ActivationAfterTurnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivationAfterTurnError';
  }
}

/**
 * How a turn ended, for the endpoint's afterTurn: the stream's own end, a
 * watchdog timeout, a lost lease, or an interruption the lanes made — the last
 * reads as a timeout unless the host was shutting down, whose turns end as
 * failures, exactly as an aborted prompt did before.
 */
function turnResultOf(input: {
  outcome: TurnStreamOutcome | undefined;
  timedOut: boolean;
  lost: LeaseLost | undefined;
  closing: boolean;
}): TurnResult {
  if (input.lost) {
    return {
      stopReason: null,
      timedOut: false,
      error: `member lease ${input.lost.key} was lost (${input.lost.reason})`,
    };
  }
  if (input.outcome && !input.outcome.interrupted) {
    const { stopReason, error } = input.outcome;
    if (input.timedOut) {
      return { stopReason: null, timedOut: true, ...(error ? { error } : { error: 'turn timed out' }) };
    }
    return { stopReason, timedOut: false, ...(error ? { error } : {}) };
  }
  if (input.closing) {
    return { stopReason: null, timedOut: false, error: 'the room lab shut down' };
  }
  return { stopReason: null, timedOut: true, error: 'turn timed out' };
}

/** The ACP process and its live session for one (room, member) key. */
interface MemberConnection {
  scope: Scope.Closeable;
  connection: AcpConnection;
  /** The live session on this connection, reused while the process lives. */
  session?: AcpSessionHandle;
}

/**
 * The endpoint's assembly (docs/architecture/agent-collaboration.md): the record comes from `@rivus/agent-room`
 * through the sqlite stream store; the ACP driving, the scheduling and the
 * leases come from `@rivus/agent-kit` (`/acp`, `/lanes`, `/lease`); and
 * everything with a product name — seating, settings, the Room tools, the
 * turn log, the tool server — lives here. The host is the Effect assembly
 * root: one ManagedRuntime feeds every lane activation, and the wake/cancel
 * callbacks run their Effects on it and observe their failures.
 */
export class RoomLabHost {
  private readonly store: SqliteRoomStore;
  private readonly services = new Map<string, RoomService>();
  private catalog: RoomCatalog;
  private inventoryCache?: RoomAgentProbeItem[];
  /**
   * The tools endpoint each (room, member) session carries, by runtime key.
   * Hosted at the session's first activation, re-served on every later one,
   * released when the session's process is discarded.
   */
  private readonly sessionTools = new Map<string, HostedTools>();

  /** The one roster the desk, the routes and the views read members from. */
  readonly agents: AgentRegistry;

  private readonly probeRow: (agent: RoomAgentSpec) => Promise<RoomAgentProbe>;
  private readonly controlRegistry: SqliteAgentRegistry;
  private readonly toolServer: ToolServer;
  private readonly turnLog: SqliteTurnLog;
  /** The room_dm write path; the child rooms it opens are this host's. */
  private readonly dm: RoomDm;

  /** The Effect assembly root: the platform, the binding store and the lease repository. */
  private readonly rt: ManagedRuntime<PlatformService | LeaseRepository | SessionBindingStore, LeaseRepositoryFailure>;
  /** The scope the lanes live in; closing it runs the lanes' own close. */
  private readonly hostScope: Scope.Closeable = Scope.makeUnsafe();
  private readonly lease: LeaseManager;
  private readonly lanes: Lanes;
  /** The ACP process (and its session) kept per key across activations. */
  private readonly connections = new Map<string, MemberConnection>();
  /** The member lease each running activation holds, for the turn's fenced writes. */
  private readonly activeLeases: ActiveRoomLeases;
  private closing = false;
  /** The lease and lanes, once start has finished; every use waits for it. */
  private readonly core: Promise<{ lease: LeaseManager; lanes: Lanes }>;

  constructor(store: SqliteRoomStore = SqliteRoomStore.open(), bindings: RoomLabHostBindings = {}) {
    this.store = store;
    this.agents = store.agents;
    this.catalog = store.loadCatalog();
    this.probeRow = bindings.probe ?? ((agent) => this.rt.runPromise(probeRoomAgent(agent)));
    this.controlRegistry = new SqliteAgentRegistry(store.db);
    this.toolServer = new ToolServer();
    this.turnLog = new SqliteTurnLog(store.db);
    this.dm = new RoomDm({
      findPrivate: (parentRoomId, members) => this.catalog.findPrivate(parentRoomId, members),
      openPrivate: (input) => {
        const record = this.catalog.openPrivate(input);
        this.store.saveRoom(record);
        return record;
      },
      stream: (roomId) => this.store.stream(roomId),
      dispatch: (roomId, event) => this.open(roomId).dispatch(event),
      now: nowIso,
    });
    const home = store.home;
    const leaseLayer = roomLeaseRepositoryLayer(roomLeasePath(home));
    const bindingLayer = FileSessionBindingStoreLive(join(home, 'acp-sessions.json')).pipe(
      Layer.provideMerge(NodePlatformLive),
    );
    this.rt = makeManagedRuntime(Layer.mergeAll(leaseLayer, bindingLayer));
    this.lease = this.rt.runSync(createRoomLeaseManager());
    this.activeLeases = new ActiveRoomLeases(
      this.rt as ManagedRuntime<PlatformService | LeaseRepository, LeaseRepositoryFailure>,
      this.lease,
    );
    this.lanes = this.rt.runSync(
      Effect.provideService(
        createLanes({
          maxConcurrent: LANES_MAX_CONCURRENT,
          maxQueued: LANES_MAX_QUEUED,
          turnTimeoutMs: TURN_TIMEOUT_MS,
          activate: (key) => this.activateKey(key),
          onExit: (exit) => Effect.sync(() => this.activationExited(exit)),
        }),
        Scope.Scope,
        this.hostScope,
      ),
    );
    const lease = this.lease;
    const lanes = this.lanes;
    this.core = Promise.resolve({ lease, lanes });
  }

  /**
   * The lanes' activate handler: one key, one room's member. The lease, the
   * connection and the prompt live and die inside this Effect — it acquires
   * the lease, reuses or starts the process and the session, asks the room for
   * the Harness, prompts, and ends only after afterTurn's fenced writes have
   * landed. `cancel`, `close` and the turn timeout interrupt it; the finalizers
   * run before the lane moves on.
   */
  private readonly activateKey = (
    key: string,
  ): Effect.Effect<unknown, unknown, PlatformService | LeaseRepository | Scope.Scope> =>
    Effect.gen({ self: this }, function* () {
      const { roomId, agentId } = yield* attempt(() => parseRuntimeKey(key));
      const service = this.open(roomId);

      // The lease joins the activation's scope: the kit's heartbeat fiber renews
      // it while the turn runs, and closing the scope stops the heartbeat and
      // releases the lease — after afterTurn, which registers itself later and
      // therefore runs first.
      const held = yield* this.lease.acquire(key);
      yield* Effect.sync(() => this.activeLeases.admit(key, held));
      yield* Effect.addFinalizer(() => Effect.sync(() => this.activeLeases.withdraw(key)));

      const agent = yield* Effect.tryPromise({
        try: () => this.controlRegistry.get(agentId),
        catch: (cause) => cause,
      });
      if (!agent) {
        return yield* Effect.fail(new Error(`no agent ${agentId} in the registry`));
      }
      const harness: TurnHarness = yield* Effect.tryPromise({
        try: () => service.activate(agentId),
        catch: (cause) => cause,
      });

      // The turn's outcome so far; afterTurn reads it once the turn is over,
      // whatever way it ended.
      const recorded = yield* Ref.make<TurnStreamOutcome | undefined>(undefined);
      const timedOut = yield* Ref.make(false);
      const lost = yield* Ref.make<LeaseLost | undefined>(undefined);
      const turnEnded = yield* Deferred.make<void>();
      yield* Effect.addFinalizer(() =>
        Effect.gen({ self: this }, function* () {
          const outcome = yield* Ref.get(recorded);
          const result = turnResultOf({
            outcome,
            timedOut: yield* Ref.get(timedOut),
            lost: yield* Ref.get(lost),
            closing: this.closing,
          });
          yield* Effect.tryPromise({
            try: () => harness.hooks?.afterTurn?.(result) ?? Promise.resolve(),
            catch: (cause) => cause,
          }).pipe(Effect.ignore);
        }),
      );

      // The process is long-lived: reuse it, and the session it holds, across
      // activations of this key. A session the process no longer holds is
      // reopened from the key's binding, so it also survives a restart.
      let member = this.connections.get(key);
      if (!member) {
        const scope = Scope.makeUnsafe();
        const connection = yield* connectRoomAgent(agent, harness.cwd).pipe(Effect.provideService(Scope.Scope, scope));
        // When the process ends for any reason — exit, a cancel that never
        // settled — the key starts fresh next time, and the tools its session
        // hosted go with it.
        yield* connection.ended.pipe(
          Effect.andThen(
            Effect.sync(() => {
              this.connections.delete(key);
              void this.discardKey(key).catch(() => undefined);
            }),
          ),
          Effect.provideService(Scope.Scope, scope),
          Effect.forkIn(scope),
        );
        member = { scope, connection };
        this.connections.set(key, member);
      }
      const live = member;
      const session =
        live.session ??
        (yield* openRoomSession(live.connection, {
          sessionKey: key,
          cwd: harness.cwd,
          mcpServers: harness.mcpServers,
          ...(harness.systemPrompt ? { systemPrompt: harness.systemPrompt } : {}),
        }).pipe(Effect.tap((opened) => Effect.sync(() => (live.session = opened)))));

      // The turn: one stream, interrupted only from outside — the kit's own
      // cancel deadline bounds every interruption — but watched by the
      // member's own watchdog and by the lease, either of which cancels the
      // turn and records why.
      yield* runTurnStream(session, harness.blocks, {
        onToolCall: () => harness.hooks?.onToolCall?.(),
      }).pipe(
        Effect.tap((outcome) => Ref.set(recorded, outcome)),
        Effect.andThen(Deferred.succeed(turnEnded, undefined)),
        Effect.forkScoped,
      );
      yield* Effect.sleep(agent.timeoutMs ?? TURN_TIMEOUT_MS).pipe(
        Effect.andThen(Ref.set(timedOut, true)),
        Effect.andThen(Effect.ignore(session.cancel())),
        Effect.ignore,
        Effect.forkScoped,
      );
      yield* held.lost.pipe(
        Effect.flatMap((reason) => Ref.set(lost, reason).pipe(Effect.andThen(Effect.ignore(session.cancel())))),
        Effect.ignore,
        Effect.forkScoped,
      );
      yield* Deferred.await(turnEnded);

      // The turn ended by itself. A timeout or a lost lease ends the
      // activation as a failure, which discards the process the turn ran on —
      // the turn row itself was already written by afterTurn.
      if (yield* Ref.get(timedOut)) {
        return yield* Effect.fail(new ActivationAfterTurnError(`the turn in ${key} timed out`));
      }
      const lostNow = yield* Ref.get(lost);
      if (lostNow) {
        return yield* Effect.fail(new ActivationAfterTurnError(`member lease ${key} was lost (${lostNow.reason})`));
      }
      return undefined;
    });

  /**
   * How each activation ended. A failure before it was a turn is reported to
   * the room (the failed row the UI reads, and the serial queue moving on);
   * any other ending only decides whether the process the key holds is
   * discarded. `close` needs neither: the host is shutting down.
   */
  private activationExited(exit: ActivationExit<unknown>): void {
    if (this.closing) {
      return;
    }
    switch (exit._tag) {
      case 'ActivationFailed': {
        void this.discardConnection(exit.key);
        const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
        if (failure instanceof ActivationAfterTurnError) {
          return;
        }
        const message =
          failure instanceof Error ? failure.message : failure !== undefined ? inspect(failure) : 'activation failed';
        this.reportActivationFailure(exit.key, message);
        return;
      }
      case 'ActivationInterrupted':
        // A cancel or a backstop timeout leaves the process of unknown health;
        // the next activation starts fresh. Shutdown closes them all anyway.
        void this.discardConnection(exit.key);
        return;
      case 'ActivationSucceeded':
        return;
    }
  }

  /** A wake the lanes refused: the room hears it as an activation that failed before it was a turn. */
  private wakeFailed(key: string, error: unknown): void {
    if (typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'LanesClosed') {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.reportActivationFailure(key, `the wake was refused: ${message}`);
  }

  private reportActivationFailure(key: string, message: string): void {
    let roomId: string;
    let agentId: RoomLabAgentId;
    try {
      ({ roomId, agentId } = parseRuntimeKey(key));
    } catch {
      return;
    }
    if (!this.services.has(roomId)) {
      return;
    }
    this.open(roomId).activationFailed(agentId, message);
  }

  /**
   * Stops a key's process and releases the tools endpoint its session hosted
   * — no port outlives its session.
   */
  private async discardKey(key: string): Promise<void> {
    const hosted = this.sessionTools.get(key);
    if (!hosted) {
      return;
    }
    this.sessionTools.delete(key);
    await hosted.close().catch(() => undefined);
  }

  private async discardConnection(key: string): Promise<void> {
    const member = this.connections.get(key);
    this.connections.delete(key);
    if (member) {
      await this.rt.runPromise(Scope.close(member.scope, Exit.void)).catch(() => undefined);
    }
    await this.discardKey(key);
  }

  /** Re-reads the `agents` table; the next probe re-runs against the new rows. */
  private reloadAgents(): void {
    this.agents.reload();
    this.inventoryCache = undefined;
  }

  list() {
    return this.catalog.list();
  }

  lastOpened() {
    return this.catalog.lastOpened();
  }

  /**
   * The desk's rows as the last scan left them. The first call probes every
   * row — one ACP process per row, asked `initialize` plus a trial
   * `session/new` — and the answers are cached until 重新扫描.
   */
  async inventory(): Promise<RoomAgentProbeItem[]> {
    await this.core;
    if (this.inventoryCache) {
      return this.inventoryCache;
    }
    const agents = this.agents.list();
    const rooms = this.list();
    const items = await Promise.all(
      agents.map(async (agent) => {
        const probe = await this.probeRow({ id: agent.id, command: agent.command });
        return {
          id: agent.id,
          label: agent.label,
          role: agent.role,
          color: agent.color,
          command: agent.command,
          availability: deriveAgentAvailability({
            probe: probe.status,
            seatedIn: rooms.filter((room) => room.memberIds.includes(agent.id)).length,
          }),
        };
      }),
    );
    return (this.inventoryCache = items);
  }

  /**
   * What 重新扫描 does: re-read the table, then probe it again. Both halves are
   * needed — a row edited outside this process is as much a change as an
   * adapter that has since been installed or logged into.
   */
  async refreshInventory(): Promise<RoomAgentProbeItem[]> {
    this.reloadAgents();
    return this.inventory();
  }

  /**
   * Writes the desk's add-agent form to a new row and re-reads the table, so
   * the next scan answers for it. The id is the word after `@`, which is why it
   * must match the mention grammar; the role is the endpoint's own column.
   */
  async addAgent(input: { id: string; label: string; role?: string; command: string }): Promise<void> {
    await this.core;
    const id = input.id.trim();
    if (!isAgentId(id)) {
      throw new RoomInputError('An agent id must match ^[a-z][a-z0-9-]*$');
    }
    if (this.agents.has(id)) {
      throw new RoomInputError(`Agent ${id} already exists`);
    }
    const label = input.label.trim();
    if (!label) {
      throw new RoomInputError('An agent needs a label');
    }
    const command = input.command.trim();
    if (!command) {
      throw new RoomInputError('An agent needs a command to probe');
    }
    this.store.addAgent({ id, label, role: input.role?.trim() || INHERITED_AGENT_ROLE, command });
    this.reloadAgents();
  }

  /**
   * Writes the prompt onto the member's row and re-reads the table, so the next
   * turn in any open room uses it without restarting the server.
   */
  async saveSystemPrompt(agentId: RoomLabAgentId, prompt: string): Promise<void> {
    await this.core;
    this.store.saveSystemPrompt(agentId, prompt);
    // Re-read the rows, but keep the probe: a prompt has nothing to do with
    // whether the adapter starts, and re-probing costs an ACP process.
    this.agents.reload();
  }

  async agentDesk(): Promise<AgentDeskView> {
    await this.core;
    const rooms = this.list();
    const lastOpenedId = this.lastOpened()?.id;
    return {
      ...(lastOpenedId === undefined ? {} : { lastOpenedId }),
      agents: (await this.inventory()).map((agent) => ({
        ...agent,
        seatedIn: rooms
          .filter((room) => room.memberIds.includes(agent.id))
          .map((room) => ({ id: room.id, title: room.title })),
        systemPrompt: this.agents.get(agent.id)?.systemPrompt ?? '',
      })),
    };
  }

  async create(input: {
    title: string;
    goal?: string;
    memberIds?: readonly RoomLabAgentId[];
    wake?: RoomWakeMode;
    serial?: boolean;
    cwd?: string;
  }): Promise<RoomLabState> {
    await this.core;
    const record = this.catalog.create(createRoomRecordInput(input));
    this.store.saveRoom(record);
    this.store.saveLastOpened(record);
    return this.snapshot(record.id);
  }

  async snapshot(roomId: string): Promise<RoomLabState> {
    await this.core;
    if (this.catalog.lastOpened()?.id !== roomId) {
      this.store.saveLastOpened(this.catalog.touch(roomId, nowIso()));
    }
    const service = this.open(roomId);
    return await this.decorate(await service.snapshot(), roomId);
  }

  async act(roomId: string, input: Exclude<RoomLabAction, { action: 'create' }>): Promise<RoomLabState> {
    await this.core;
    const service = this.open(roomId);
    switch (input.action) {
      case 'message':
        return await this.decorate(await service.sendMessage(input.body, input.clientMessageId), roomId);
      case 'compose': {
        this.setMembers(roomId, input.agentIds);
        return await this.decorate(await service.snapshot(), roomId);
      }
      case 'settings': {
        this.setSettings(roomId, input);
        return await this.decorate(await service.snapshot(), roomId);
      }
      case 'reset':
        return await this.decorate(await service.reset(), roomId);
      default:
        throw new Error('Unknown Room action');
    }
  }

  private setMembers(roomId: string, agentIds: readonly RoomLabAgentId[]): void {
    const record = this.catalog.replaceMembers(roomId, agentIds, nowIso());
    this.store.saveRoom(record);
  }

  private setSettings(roomId: string, settings: { wake?: RoomWakeMode; serial?: boolean; cwd?: string }): void {
    const record = this.catalog.replaceSettings(roomId, settings, nowIso());
    this.store.saveRoom(record);
  }

  open(roomId: string): RoomService {
    const existing = this.services.get(roomId);
    if (existing) {
      return existing;
    }
    // A room that is not in the catalog has no service; get throws first.
    this.catalog.get(roomId);
    const isPrivate = this.catalog.get(roomId).parentRoomId !== undefined;
    const service = new RoomService({
      roomId: { tenantId: 'local', conversationId: roomId },
      store: this.store.stream(roomId),
      registry: this.controlRegistry,
      runtime: this.memberRuntime,
      lease: this.activeLeases,
      turnLog: this.turnLog,
      members: () => this.catalog.get(roomId).memberIds,
      agents: () =>
        this.agents.list().map((agent) => ({
          id: agent.id,
          label: agent.label,
          role: agent.role,
          color: agent.color,
        })),
      settings: () => {
        const current = this.catalog.get(roomId);
        return { wake: current.wake, serial: current.serial, ...(current.cwd ? { cwd: current.cwd } : {}) };
      },
      roomTitle: () => this.catalog.get(roomId).title,
      workRoot: defaultWorkRoot,
      toolHost: ({ agentId, tools, authorize }) => this.hostSessionTools(roomId, agentId, tools, authorize),
      // A private room offers no room_dm: its two members are already alone,
      // and a dm between them would open a grandchild room the person cannot
      // see (docs/architecture/agent-collaboration.md: private rooms hang one level under their parent).
      ...(isPrivate ? {} : { dm: this.dm }),
      parentTitle: this.parentTitleOf(roomId),
      ledgerOf: (ancestor) => this.open(ancestor),
      childRooms: () =>
        this.catalog
          .list()
          .filter((room) => room.parentRoomId === roomId)
          .map((room) => room.id),
      resetChild: (id) => this.open(id),
    });
    this.services.set(roomId, service);
    return service;
  }

  /**
   * Stops the lab: the tool endpoints its sessions carry, then the lanes —
   * whose close interrupts every running activation and waits for the
   * finalizers, afterTurn included — then the ACP processes the keys still
   * hold, then the scope the lanes live in and the runtime itself. A hot
   * reload or a shutdown that skips this leaks one child process and one port
   * per session.
   */
  async close(): Promise<void> {
    this.closing = true;
    const hosted = [...this.sessionTools.values()];
    this.sessionTools.clear();
    await Promise.all(hosted.map((tools) => tools.close().catch(() => undefined)));
    const { lanes } = await this.core;
    await this.rt.runPromise(lanes.close).catch(() => undefined);
    const members = [...this.connections.values()];
    this.connections.clear();
    await Promise.all(
      members.map((member) => this.rt.runPromise(Scope.close(member.scope, Exit.void)).catch(() => undefined)),
    );
    await this.rt.runPromise(Scope.close(this.hostScope, Exit.void)).catch(() => undefined);
    await this.rt.dispose();
  }

  /** What a private room's turn facts call the room it was opened from. */
  private parentTitleOf(roomId: string): (() => string) | undefined {
    const parentId = this.catalog.get(roomId).parentRoomId;
    if (!parentId) {
      return undefined;
    }
    return () => this.catalog.get(parentId).title;
  }

  /**
   * The Room tools endpoint of one member's session: hosted at the session's
   * first activation — its `session/new` is what carries the endpoint — and
   * re-served on every later activation, because ACP carries `mcpServers`
   * only on `session/new`. The per-call gate keeps the turn-scoped
   * authorization: a call passes only while the member has an open turn.
   */
  private async hostSessionTools(
    roomId: string,
    agentId: RoomLabAgentId,
    tools: ToolDefinition[],
    authorize: () => boolean,
  ): Promise<HostedTools> {
    const key = runtimeKey(roomId, agentId);
    const existing = this.sessionTools.get(key);
    if (existing) {
      existing.serveTurn({ tools, authorize });
      return existing;
    }
    const hosted = await this.toolServer.hostTools({
      tools,
      authorize,
      token: randomUUID(),
    });
    this.sessionTools.set(key, hosted);
    return hosted;
  }

  async decorate(state: RoomView, roomId: string): Promise<RoomLabState> {
    const record = this.catalog.get(roomId);
    const inventory = new Map((await this.inventory()).map((agent) => [agent.id, agent]));
    return {
      ...state,
      roomId,
      title: record.title,
      ...(record.goal === undefined ? {} : { goal: record.goal }),
      settings: {
        wake: record.wake,
        serial: record.serial,
        ...(record.cwd === undefined ? {} : { cwd: record.cwd }),
      },
      catalog: this.catalogView(),
      agents: state.agents.map((agent) => {
        const listed = inventory.get(agent.id);
        return {
          ...agent,
          availability: listed?.availability ?? 'missing',
          ...(listed?.command ? { command: listed.command } : {}),
        };
      }),
    };
  }

  /**
   * The sidebar's rooms, private rooms nested under the room they were opened
   * from (docs/architecture/agent-collaboration.md). Roots keep their creation order; so do the children.
   */
  catalogView(): RoomCatalogItemView[] {
    const items = new Map<string, RoomCatalogItemView>(
      this.catalog.list().map((room) => {
        const preview = this.store.preview(room.id);
        return [
          room.id,
          {
            id: room.id,
            title: room.title,
            updatedAt: preview.lastAt ?? room.updatedAt,
            memberCount: room.memberIds.length,
            ...(preview.lastLine === undefined ? {} : { lastLine: preview.lastLine }),
          },
        ];
      }),
    );
    const roots: RoomCatalogItemView[] = [];
    for (const room of this.catalog.list()) {
      const item = items.get(room.id)!;
      const parent = room.parentRoomId ? items.get(room.parentRoomId) : undefined;
      if (parent) {
        (parent.children ??= []).push(item);
      } else {
        roots.push(item);
      }
    }
    return roots;
  }

  /** The scheduler the rooms see: wake and cancel run their Effects on the host's ManagedRuntime. */
  private readonly memberRuntime: RoomMemberRuntime = {
    wake: (key) => {
      // `wake` never blocks the caller; a failure to ask is observed here.
      void this.core
        .then(({ lanes }) => this.rt.runPromise(lanes.wake(key)))
        .catch((error: unknown) => this.wakeFailed(key, error));
    },
    cancel: (key) =>
      this.core
        .then(({ lanes }) => this.rt.runPromise(lanes.cancel(key)))
        .then(
          () => undefined,
          () => undefined,
        ),
  };
}

export { RoomCatalogInvariantError };
export { RoomInputError };
