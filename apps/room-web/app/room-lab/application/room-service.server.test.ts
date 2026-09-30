import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MemoryRoomStreamStore,
  type AgentSessionId,
  type RoomEvent,
  type RoomId,
} from '@rivus/agent-room';
import {
  LeaseManager,
  nodeClock,
  nodeLiveness,
  OrchestrationConflictError,
  runtimeKey,
  type Agent,
  type AgentRegistry,
  type FencingToken,
  type Harness,
  type LeaseRecord,
  type ToolDefinition,
} from '@rivus/agent-orchestration';
import type { McpServer } from '@agentclientprotocol/sdk';
import { RoomCatalog } from '../domain/room-catalog';
import { SqliteRoomStore } from '../infrastructure/sqlite-room-store.server';
import { SqliteLeaseStore } from '../infrastructure/sqlite-lease-store.server';
import { SqliteTurnLog } from '../infrastructure/sqlite-turn-log.server';
import { RoomService } from './room-service.server';
import {
  HELD_LIMIT,
  type AgentDescriptor,
  type RoomDmGateway,
  type RoomLeases,
  type RoomMemberRuntime,
  type RoomRecordStore,
  type RoomSettings,
  type TurnLog,
  type RoomToolHost,
} from './ports';
import type { RoomLabAgentId, RoomTurnView } from '../read-model';
import { copy } from '../copy';

const ROOM: RoomId = { tenantId: 'local', conversationId: 'r_testcase' };
const SEATED = ['claude', 'codex', 'opencode'];
const TOKEN: FencingToken = { key: 'room:r_testcase:member:x', holderPid: 1, holderId: 'test' };
const LABELS: Record<string, string> = { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode' };

interface BuildOptions {
  members?: readonly string[];
  settings?: Partial<RoomSettings>;
  prompts?: Record<string, string>;
  /** Wakes are only recorded; the test starts and ends each turn itself. */
  manual?: boolean;
  /** Replaces the wake recorder wholesale: the chain tests drive turns themselves. */
  runtime?: RoomMemberRuntime;
  /** Replaces the pass-through lease: the cursor tests fence against a real one. */
  lease?: RoomLeases;
  /** The private-room gateway, when the room offers room_dm. */
  dm?: RoomDmGateway;
  /** Set on a private room: what its turn facts call the room it hangs under. */
  parentTitle?: () => string;
}

interface Built {
  service: RoomService;
  runtime: FakeRuntime;
  /** The runtime the service actually holds: the fake, or the test's stand-in. */
  memberRuntime: RoomMemberRuntime;
  /** The lease the service actually holds: the pass-through, or the test's. */
  lease: RoomLeases;
  turnLog: FakeTurnLog;
  store: MemoryRoomStreamStore;
  /** The Room tool definitions of each activation, in activation order. */
  tools: ToolDefinition[][];
  /** One Room tool of one member's latest activation, by name. */
  toolOf(agentId: string, name: string): ToolDefinition;
}

/**
 * The room service over an in-memory record, a roster of three and a fake
 * scheduler. Without `manual` every wake runs to a silent end at once, which
 * is what the dispatcher tests need; the turn tests run manual and end each
 * activation by hand.
 */
function build(options: BuildOptions = {}): Built {
  const members = options.members ?? SEATED;
  const settings: RoomSettings = { wake: 'broadcast', serial: false, ...options.settings };
  const store = new MemoryRoomStreamStore();
  const turnLog = new FakeTurnLog();
  const tools: ToolDefinition[][] = [];
  const toolsByAgent = new Map<string, ToolDefinition[]>();
  const runtime = new FakeRuntime(options.manual ?? false);
  const memberRuntime = options.runtime ?? runtime;
  const toolHost: RoomToolHost = async ({ agentId, tools: definitions }) => {
    tools.push(definitions);
    toolsByAgent.set(agentId, definitions);
    // The real endpoint outlives the turn; these tests call the tool
    // definitions directly, so re-serving is a no-op here.
    return {
      endpoint: {} as unknown as McpServer,
      url: 'http://127.0.0.1:0/mcp',
      serveTurn: () => undefined,
      close: async () => {},
    };
  };
  const prompts = options.prompts ?? {};
  const registry: AgentRegistry = {
    get: async id => (members.includes(id)
      ? agentOf(id, prompts[id] ?? '')
      : undefined),
    list: async () => members.map(id => agentOf(id, prompts[id] ?? '')),
    save: async () => {},
    remove: async () => {},
  };
  const descriptors: AgentDescriptor[] = members.map(id => ({
    id, label: LABELS[id] ?? id, role: '成员', color: 1,
  }));
  const lease = options.lease ?? { fence: (_key, op) => op(), read: () => undefined };
  const service = new RoomService({
    roomId: ROOM,
    // The memory store has no clear — reset is the sqlite store's business and
    // is not what these tests exercise.
    store: store as unknown as RoomRecordStore,
    registry,
    runtime: memberRuntime,
    lease,
    turnLog,
    members: () => members,
    agents: () => descriptors,
    settings: () => ({ ...settings }),
    roomTitle: () => '测试房间',
    workRoot: () => mkdtempSync(join(tmpdir(), 'rivus-room-service-')),
    toolHost,
    ...(options.dm ? { dm: options.dm } : {}),
    ...(options.parentTitle ? { parentTitle: options.parentTitle } : {}),
  });
  runtime.bind(service, turnLog, tools);
  return {
    service,
    runtime,
    memberRuntime,
    lease,
    turnLog,
    store,
    tools,
    toolOf: (agentId, name) => {
      const found = toolsByAgent.get(agentId)?.find(definition => definition.name === name);
      if (!found) throw new Error(`no ${name} tool on ${agentId}'s latest turn`);
      return found;
    },
  };
}

function agentOf(id: string, systemPrompt: string): Agent {
  return { id, label: LABELS[id] ?? id, binding: { command: `${id}-acp` }, systemPrompt };
}

function keyOf(memberId: string): string {
  return runtimeKey(ROOM.conversationId, memberId);
}

function sessionId(agentId: string): AgentSessionId {
  return { tenantId: ROOM.tenantId, agentId, roomId: ROOM, runtimeGenerationId: 'web-v1' };
}

async function eventsOf(store: MemoryRoomStreamStore): Promise<RoomEvent[]> {
  const slice = await store.readSlice(ROOM, 0, { maxEvents: 100 });
  return slice.events;
}

/** One started activation: the harness, its end, and its room_speak tool. */
interface Activation {
  harness: Harness;
  /** Ends the turn; resolves once the log row has landed. */
  end(result?: { stopReason?: string | null; error?: string; timedOut?: boolean }): Promise<void>;
  speakTool(): ToolDefinition;
}

/** Records wakes; in auto mode runs each one to a silent end immediately. */
class FakeRuntime implements RoomMemberRuntime {
  readonly wakes: string[] = [];
  private service: RoomService | undefined;
  private turnLog: FakeTurnLog | undefined;
  private tools: ToolDefinition[][] = [];

  constructor(private readonly manual: boolean) {}

  bind(service: RoomService, turnLog: FakeTurnLog, tools: ToolDefinition[][]): void {
    this.service = service;
    this.turnLog = turnLog;
    this.tools = tools;
  }

  wake(key: string): void {
    this.wakes.push(key);
    if (this.manual) return;
    void this.activated(key).then(activation => activation.end());
  }

  async activated(key: string): Promise<Activation> {
    const holder = this.service!;
    const log = this.turnLog!;
    const agentId = key.slice(key.lastIndexOf(':member:') + ':member:'.length) as RoomLabAgentId;
    const harness = await holder.activate(agentId);
    return {
      harness,
      end: async (result?: { stopReason?: string | null; error?: string; timedOut?: boolean }) => {
        // The real runtime awaits the hook's promise before it releases the
        // lease; the fake has no lease, so it just waits the turn out.
        await harness.hooks?.afterTurn?.({
          stopReason: (result && result.stopReason !== undefined ? result.stopReason : 'end_turn') as 'end_turn',
          // `null` with no error defaults to the watchdog — the only way a
          // turn ends as timeout; a test can say otherwise explicitly.
          timedOut: result?.timedOut ?? (result?.stopReason === null && !result?.error),
          token: TOKEN,
          ...(result?.error ? { error: result.error } : {}),
        });
        await log.drain();
      },
      speakTool: () => {
        const found = this.tools.at(-1)?.find(definition => definition.name === 'room_speak');
        if (!found) throw new Error('no room_speak tool on this turn');
        return found;
      },
    };
  }
}

/** A turn log the tests can wait on: every append is one turn finished. */
class FakeTurnLog implements TurnLog {
  readonly rows: RoomTurnView[] = [];
  /** The room ids whose rows a reset cleared, in order. */
  readonly cleared: string[] = [];
  /** The room each row belongs to, so `clear` can keep the same semantics. */
  private readonly rowRoomIds: string[] = [];
  private waiters: Array<{ count: number; resolve: () => void }> = [];

  append(record: Parameters<TurnLog['append']>[0]): void {
    this.rows.push({
      id: record.id,
      agentId: record.agentId,
      roundSeq: record.roundSeq,
      triggerSeq: record.triggerSeq,
      startedAt: record.startedAt,
      ...(record.endedAt ? { endedAt: record.endedAt } : {}),
      ...(record.outcome ? { outcome: record.outcome } : {}),
      ...(record.postedSeq === undefined ? {} : { postedSeq: record.postedSeq }),
      heldCount: record.heldCount ?? 0,
      ...(record.error ? { error: record.error } : {}),
    });
    this.rowRoomIds.push(record.roomId);
    this.waiters = this.waiters.filter(waiter => {
      if (this.rows.length < waiter.count) return true;
      waiter.resolve();
      return false;
    });
  }

  listByRoom(): RoomTurnView[] {
    return [...this.rows];
  }

  clear(roomId: string): void {
    this.cleared.push(roomId);
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rowRoomIds[index] !== roomId) continue;
      this.rows.splice(index, 1);
      this.rowRoomIds.splice(index, 1);
    }
  }

  /** Resolves once at least `count` turns have been logged. */
  waitFor(count: number): Promise<void> {
    if (this.rows.length >= count) return Promise.resolve();
    return new Promise(resolve => { this.waiters.push({ count, resolve }); });
  }

  /**
   * The chain tests drive turns through wakes, whose follow-on activations
   * land a macrotask late; a handful of timers settles them before the test
   * asserts. (The chain is microtasks only — the fake lease and store are
   * synchronous — so the timers are always enough.)
   */
  async drain(): Promise<void> {
    for (let round = 0; round < 5; round += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}

/** An event as the Room tools hand it to the member: no author object. */
interface ToolEvent {
  seq: number;
  from: string;
  to?: string[];
  kind: string;
  body: string;
}

/**
 * A member that behaves: it reads its room facts and inbox and follows the
 * count-off rule — say my number once the one before mine is on the record,
 * otherwise end the turn without a Room tool.
 */
function countOffDecision(bodies: string[], seat: number): string | undefined {
  const numbers = bodies.map(body => body.trim()).filter(body => /^\d+$/.test(body)).map(Number);
  if (numbers.length === 0) return seat === 1 ? '1' : undefined;
  return Math.max(...numbers) === seat - 1 ? String(seat) : undefined;
}

/** The member's own seat, read out of the facts block the service assembled. */
function seatOf(harness: Harness): number {
  const facts = harness.blocks.map(block => ('text' in block ? block.text : '')).join('\n');
  const match = facts.match(/member (\d+) of/);
  if (!match) throw new Error('no seat number in the room facts');
  return Number(match[1]!);
}

/** The bodies on the transcript the activation carried in. */
function transcriptBodies(harness: Harness): string[] {
  const text = harness.blocks.map(block => ('text' in block ? block.text : '')).join('\n');
  return [...text.matchAll(/\[seq \d+\] @[^:]*: (.*)$/gm)].map(match => match[1]!);
}

/**
 * The scheduler a chain test drives through: the runtime's Inbox over one
 * member — one activation at a time, a wake during one collapses into exactly
 * one further activation — running each turn to the behaviour's end. What the
 * real Inbox does for wakes, this does for the whole chain, so a walkthrough
 * test can let a round run itself out.
 */
class ChainRuntime implements RoomMemberRuntime {
  readonly wakes: string[] = [];
  private readonly running = new Set<RoomLabAgentId>();
  private readonly pending = new Set<RoomLabAgentId>();
  private service: RoomService | undefined;
  private turnLog: FakeTurnLog | undefined;
  private toolOf: ((agentId: string, name: string) => ToolDefinition) | undefined;

  constructor(
    private readonly decide: (agentId: RoomLabAgentId, harness: Harness, read: string[]) =>
      { body: string; addressedTo?: string[] } | undefined,
  ) {}

  bind(
    service: RoomService,
    turnLog: FakeTurnLog,
    toolOf: (agentId: string, name: string) => ToolDefinition,
  ): void {
    this.service = service;
    this.turnLog = turnLog;
    this.toolOf = toolOf;
  }

  /** Resolves once every wake has run to its end, pending re-runs included. */
  async settled(): Promise<void> {
    while (this.running.size > 0 || this.pending.size > 0) {
      await this.turnLog!.drain();
    }
    await this.turnLog!.drain();
  }

  wake(key: string): void {
    this.wakes.push(key);
    const agentId = agentIdOf(key);
    if (this.running.has(agentId)) {
      this.pending.add(agentId);
      return;
    }
    void this.runTurn(agentId);
  }

  private async runTurn(agentId: RoomLabAgentId): Promise<void> {
    this.running.add(agentId);
    try {
      const harness = await this.service!.activate(agentId);
      const speak = this.toolOf!(agentId, 'room_speak');
      const read = this.toolOf!(agentId, 'room_read');
      // The HELD rule: a held speak reads the newer events and decides
      // again inside the same turn, until it posts, passes, or the tool closes.
      const readBodies: string[] = [];
      for (let attempt = 0; attempt <= HELD_LIMIT; attempt += 1) {
        const decision = this.decide(agentId, harness, readBodies);
        if (!decision) break;
        const result = await speak.handler(
          { body: decision.body, addressedTo: decision.addressedTo ?? [] },
          { sessionId: undefined },
        ) as { posted?: { seq: number }; held?: { newer: ToolEvent[] }; error?: string };
        if (result.posted || result.error) break;
        if (!result.held) break;
        const slice = await read.handler(
          { afterSeq: Math.max(0, (result.held.newer[0]?.seq ?? 1) - 1) },
          { sessionId: undefined },
        ) as { events: ToolEvent[] };
        readBodies.push(...slice.events.map(event => event.body));
      }
      // The real runtime awaits the hook's promise before it releases the
      // lease; the drain below waits out the wake-followed activations.
      await harness.hooks?.afterTurn?.({ stopReason: 'end_turn', timedOut: false, token: TOKEN });
      await this.turnLog!.drain();
    } finally {
      this.running.delete(agentId);
    }
    if (this.pending.delete(agentId)) await this.runTurn(agentId);
  }
}

function agentIdOf(key: string): RoomLabAgentId {
  const marker = ':member:';
  return key.slice(key.lastIndexOf(marker) + marker.length) as RoomLabAgentId;
}

describe('RoomService dispatch', () => {
  it('wakes every seated member for a human message, once per transport message id', async () => {
    const h = build();
    await h.service.sendMessage('这个接口为什么偶发 502？', 'web:retry-1');
    await h.turnLog.waitFor(3);
    expect(h.runtime.wakes).toEqual([keyOf('claude'), keyOf('codex'), keyOf('opencode')]);

    // The same transport message id admits nothing and wakes nobody again.
    const before = h.runtime.wakes.length;
    await h.service.sendMessage('这个接口为什么偶发 502？', 'web:retry-1');
    expect(h.runtime.wakes).toHaveLength(before);
    const events = await eventsOf(h.store);
    expect(events.filter(event => event.kind === 'human')).toHaveLength(1);
  });

  it('in an addressed room wakes only the members named; an unaddressed one still wakes everyone', async () => {
    const h = build({ settings: { wake: 'addressed' } });
    await h.service.sendMessage('把 502 修一下，@codex 你来改重试');
    expect(h.runtime.wakes).toEqual([keyOf('codex')]);

    await h.service.sendMessage('大家看一下');
    await h.turnLog.waitFor(4);
    expect(h.runtime.wakes.slice(1)).toEqual([keyOf('claude'), keyOf('codex'), keyOf('opencode')]);
  });

  it('keeps @-mentions a signal in a broadcast room, not a routing rule', async () => {
    const h = build();
    await h.service.sendMessage('@codex 你怎么看');
    await h.turnLog.waitFor(3);
    expect(h.runtime.wakes).toEqual([keyOf('claude'), keyOf('codex'), keyOf('opencode')]);
  });

  it('posts one budget notice and stops waking once the round budget is spent', async () => {
    const h = build({ settings: { roundBudget: 2 } });
    await h.service.sendMessage('开一轮');
    await h.turnLog.waitFor(2);
    expect(h.runtime.wakes).toEqual([keyOf('claude'), keyOf('codex')]);

    // The notice lands on its own write, one microtask behind the dispatch.
    await vi.waitFor(async () => {
      const events = await eventsOf(h.store);
      expect(events.filter(event => event.kind === 'control-plane').map(event => event.body))
        .toEqual([copy.say.roundBudgetReached]);
    });
  });

  it('runs a serial room one seat at a time, in seat order', async () => {
    const h = build({ manual: true, settings: { serial: true } });
    await h.service.sendMessage('报数');
    expect(h.runtime.wakes).toEqual([keyOf('claude')]);

    // Claude's turn ends before codex is woken: one activation at a time.
    const claude = await h.runtime.activated(keyOf('claude'));
    await claude.end();
    expect(h.runtime.wakes).toEqual([keyOf('claude'), keyOf('codex')]);

    const codex = await h.runtime.activated(keyOf('codex'));
    await codex.end();
    const opencode = await h.runtime.activated(keyOf('opencode'));
    await opencode.end();
    expect(h.runtime.wakes).toEqual([keyOf('claude'), keyOf('codex'), keyOf('opencode')]);
    expect(h.turnLog.rows.map(row => row.agentId)).toEqual(['claude', 'codex', 'opencode']);
  });

  it('reads the seat order off the members the room seats now', async () => {
    const h = build({ manual: true, settings: { serial: true }, members: ['opencode', 'claude'] });
    await h.service.sendMessage('换个顺序');
    expect(h.runtime.wakes).toEqual([keyOf('opencode')]);
  });
});

describe('RoomService dispatch on member posts', () => {
  /** A member that follows the count-off rule: say my number once the one before mine is in. */
  function countOffChain(): ChainRuntime {
    return new ChainRuntime((_agentId, harness, read) => {
      const body = countOffDecision([...transcriptBodies(harness), ...read], seatOf(harness));
      return body ? { body } : undefined;
    });
  }

  it('wakes the seated peers when a member posts, and nobody when it passes', async () => {
    const h = build({ manual: true });
    await h.service.sendMessage('这个接口为什么偶发 502？');
    expect(h.runtime.wakes).toEqual([keyOf('claude'), keyOf('codex'), keyOf('opencode')]);

    // Claude posts: the same dispatch an admit runs — shouldWake over the
    // posted event, budget charged, every peer but the author woken.
    const claude = await h.runtime.activated(keyOf('claude'));
    const posted = await claude.speakTool()
      .handler({ body: '上游超时，重试没退避', addressedTo: [] }, { sessionId: undefined });
    expect(posted).toMatchObject({ posted: { seq: 2 } });
    expect(h.runtime.wakes.slice(3)).toEqual([keyOf('codex'), keyOf('opencode')]);

    // Codex has nothing to add: a pass writes no event, so it wakes nobody.
    const codex = await h.runtime.activated(keyOf('codex'));
    await codex.end();
    expect(h.runtime.wakes).toHaveLength(5);
  });

  it('applies the addressed filter to a member post too', async () => {
    const h = build({ manual: true, settings: { wake: 'addressed' } });
    await h.service.sendMessage('这个接口为什么偶发 502？');
    const claude = await h.runtime.activated(keyOf('claude'));
    await claude.speakTool()
      .handler({ body: '先看这个，@codex', addressedTo: ['codex'] }, { sessionId: undefined });
    expect(h.runtime.wakes.slice(3)).toEqual([keyOf('codex')]);
  });

  it('reproduces the count-off walkthrough on broadcast: nine turns, three posts, depth 3', async () => {
    const chain = countOffChain();
    const h = build({ runtime: chain });
    chain.bind(h.service, h.turnLog, h.toolOf);
    await h.service.sendMessage('报数');
    await chain.settled();

    // The record holds exactly the walkthrough: each seat reads its
    // predecessor's number and reports its own, one depth under its trigger.
    const events = await eventsOf(h.store);
    expect(events.map(event => [event.author.id, event.body, event.wakeDepth])).toEqual([
      ['director', '报数', 0],
      ['claude', '1', 1],
      ['codex', '2', 2],
      ['opencode', '3', 3],
    ]);
    // Three admit wakes, two per post: at most nine turns. The count can sit
    // under nine because a wake landing during a running activation collapses
    // into one re-run that reads both events (the runtime's Inbox rule) — two
    // silent passes become one. The posts themselves are exactly the
    // walkthrough's, in order and one depth under their trigger.
    expect(h.turnLog.rows.length).toBeGreaterThanOrEqual(7);
    expect(h.turnLog.rows.length).toBeLessThanOrEqual(9);
    expect(h.turnLog.rows.filter(row => row.outcome === 'posted').map(row => [row.agentId, row.postedSeq]))
      .toEqual([['claude', 2], ['codex', 3], ['opencode', 4]]);
    expect(h.turnLog.rows.every(row => row.outcome === 'posted' || row.outcome === 'passed')).toBe(true);
    // The default budget n(n+1) = 12 covers the nine: no notice anywhere.
    expect(events.filter(event => event.kind === 'control-plane')).toEqual([]);
  });

  it('reproduces the count-off on serial: five turns, one activation at a time', async () => {
    const chain = countOffChain();
    const h = build({ runtime: chain, settings: { serial: true } });
    chain.bind(h.service, h.turnLog, h.toolOf);
    await h.service.sendMessage('报数');
    await chain.settled();

    const events = await eventsOf(h.store);
    expect(events.map(event => [event.author.id, event.body, event.wakeDepth])).toEqual([
      ['director', '报数', 0],
      ['claude', '1', 1],
      ['codex', '2', 2],
      ['opencode', '3', 3],
    ]);
    // The admit wakes the first seat; each post queues the rest behind the
    // running turn, deduplicated, and the chain walks the seats in order.
    expect(chain.wakes).toEqual([
      keyOf('claude'),
      keyOf('codex'),
      keyOf('opencode'),
      keyOf('claude'),
      keyOf('codex'),
    ]);
    expect(h.turnLog.rows.map(row => [row.agentId, row.outcome])).toEqual([
      ['claude', 'posted'],
      ['codex', 'posted'],
      ['opencode', 'posted'],
      ['claude', 'passed'],
      ['codex', 'passed'],
    ]);
  });

  it('stops the chain with one notice when the round budget runs out mid-chain', async () => {
    const chain = countOffChain();
    const h = build({ runtime: chain, settings: { roundBudget: 4 } });
    chain.bind(h.service, h.turnLog, h.toolOf);
    await h.service.sendMessage('报数');
    await chain.settled();

    // The admit charged three; the post's dispatch spends the fourth on codex
    // and refuses opencode. Codex's report still starts — it was charged —
    // but the dispatch it causes finds the round spent and wakes nobody more.
    expect(chain.wakes).toEqual([
      keyOf('claude'),
      keyOf('codex'),
      keyOf('opencode'),
      keyOf('codex'),
    ]);
    expect(h.turnLog.rows).toHaveLength(4);
    expect(h.turnLog.rows.filter(row => row.outcome === 'posted').map(row => row.agentId))
      .toEqual(['claude', 'codex']);
    // The notice is itself a record event: it lands between the two counts.
    const events = await eventsOf(h.store);
    expect(events.map(event => [event.kind, event.author.id])).toEqual([
      ['human', 'director'],
      ['posted', 'claude'],
      ['control-plane', 'room'],
      ['posted', 'codex'],
    ]);
    expect(events.filter(event => event.kind === 'control-plane').map(event => event.body))
      .toEqual([copy.say.roundBudgetReached]);
  });
});

describe('RoomService turns', () => {
  it('passes for a silent turn and logs it; a speaking turn posts instead', async () => {
    const h = build({ manual: true });
    await h.service.sendMessage('先看日志，再给结论');
    expect(h.runtime.wakes).toHaveLength(3);

    // Claude reads, has nothing to add, ends without room_speak: the write
    // point is pass, and the cursor lands on what the turn read.
    const claude = await h.runtime.activated(keyOf('claude'));
    await claude.end();
    expect(h.store.inspectSession(sessionId('claude'))?.seenSeq).toBe(1);
    expect(h.turnLog.rows[0]).toMatchObject({ agentId: 'claude', outcome: 'passed', roundSeq: 1 });

    // Codex calls room_speak once: no pass runs, the log carries the post.
    const codex = await h.runtime.activated(keyOf('codex'));
    const posted = await codex.speakTool()
      .handler({ body: '上游超时，重试没有退避', addressedTo: [] }, { sessionId: undefined });
    expect(posted).toMatchObject({ posted: { seq: 2 } });
    await expect(codex.speakTool()
      .handler({ body: '再说一次', addressedTo: [] }, { sessionId: undefined }))
      .resolves.toEqual({ error: 'already-spoke' });
    await codex.end();
    await h.turnLog.waitFor(2);
    expect(h.turnLog.rows[1]).toMatchObject({ agentId: 'codex', outcome: 'posted', postedSeq: 2 });
    expect(h.store.inspectSession(sessionId('codex'))?.seenSeq).toBe(2);

    // The record shows both the post and the wake depth it earned.
    const events = await eventsOf(h.store);
    expect(events[1]).toMatchObject({ kind: 'posted', author: { id: 'codex' }, wakeDepth: 1 });
  });

  it('assembles the turn prompt: room facts, one line per inbox event, the instruction', async () => {
    const h = build({ manual: true, prompts: { codex: '先给结论。' } });
    await h.service.sendMessage('比较三档价格');
    const activation = await h.runtime.activated(keyOf('codex'));
    const { harness } = activation;
    expect(harness.systemPrompt).toBe('先给结论。');
    const texts = harness.blocks.map(block => ('text' in block ? block.text : ''));
    expect(texts[0]).toContain('You are @codex (Codex), member 2 of 3 in room "测试房间"');
    expect(texts[0]).toContain('Members in seat order: @claude, @codex, @opencode');
    expect(texts[0]).toContain('You were woken by seq 1 from @director');
    expect(texts[1]).toContain('[seq 1] @director: 比较三档价格');
    expect(texts[2]).toContain('call room_speak once');
    expect(harness.cwd).toBeTruthy();
    await activation.end();
  });

  it('answers held three times, then closes the tool and the turn ends as a pass', async () => {
    const h = build({ manual: true });
    await h.service.sendMessage('第一句');
    const claude = await h.runtime.activated(keyOf('claude'));
    await claude.end();
    await h.turnLog.waitFor(1);

    // Codex is activated at head 1; a peer's post then lands mid-turn —
    // written the way the member's own write point would, straight into the
    // record. The next room_speak is HELD against it.
    const codex = await h.runtime.activated(keyOf('codex'));
    await h.store.speak({
      session: sessionId('claude'),
      body: '我先说',
      addressedTo: [],
      readUpToSeq: 1,
      triggerSeq: 1,
    });

    const speak = codex.speakTool();
    const held = await speak.handler({ body: '我的结论', addressedTo: [] }, { sessionId: undefined });
    expect(held).toMatchObject({ held: { newer: [{ seq: 2 }] } });
    await expect(speak.handler({ body: '再试', addressedTo: [] }, { sessionId: undefined }))
      .resolves.toMatchObject({ held: {} });
    await expect(speak.handler({ body: '三试', addressedTo: [] }, { sessionId: undefined }))
      .resolves.toMatchObject({ held: {} });
    // Three HELDs close the tool: the turn cannot post any more.
    await expect(speak.handler({ body: '四试', addressedTo: [] }, { sessionId: undefined }))
      .resolves.toEqual({ error: 'held-limit' });
    await codex.end();
    await h.turnLog.waitFor(2);
    expect(h.turnLog.rows[1]).toMatchObject({ agentId: 'codex', outcome: 'passed', heldCount: 3 });
  });

  it('carries only the events after the cursor into the next turn', async () => {
    const h = build({ manual: true, members: ['claude', 'codex'] });
    await h.service.sendMessage('第一轮');
    const claude = await h.runtime.activated(keyOf('claude'));
    await claude.end();
    await h.turnLog.waitFor(1);
    const codex = await h.runtime.activated(keyOf('codex'));
    await codex.end();
    await h.turnLog.waitFor(2);

    // A second round: both cursors stand at 1, so only seq 2 is unread.
    await h.service.sendMessage('第二轮');
    const claudeAgain = await h.runtime.activated(keyOf('claude'));
    const texts = claudeAgain.harness.blocks.map(block => ('text' in block ? block.text : ''));
    expect(texts[1]).toContain('[seq 2]');
    expect(texts[1]).not.toContain('[seq 1]');
    await claudeAgain.end();
  });

  it('logs a timed-out turn and a failed turn with their error', async () => {
    const h = build({ manual: true });
    await h.service.sendMessage('慢工出细活');
    const claude = await h.runtime.activated(keyOf('claude'));
    await claude.end({ stopReason: null });
    await h.turnLog.waitFor(1);
    expect(h.turnLog.rows[0]).toMatchObject({ agentId: 'claude', outcome: 'timeout' });

    const codex = await h.runtime.activated(keyOf('codex'));
    await codex.end({ stopReason: 'end_turn', error: 'ACP connection closed' });
    await h.turnLog.waitFor(2);
    expect(h.turnLog.rows[1]).toMatchObject({ agentId: 'codex', outcome: 'failed', error: 'ACP connection closed' });

    // A prompt that resolved but reported no stop reason is a pass, not a
    // timeout: only the watchdog makes a timeout.
    const opencode = await h.runtime.activated(keyOf('opencode'));
    await opencode.end({ stopReason: null, timedOut: false });
    await h.turnLog.waitFor(3);
    expect(h.turnLog.rows[2]).toMatchObject({ agentId: 'opencode', outcome: 'passed' });
  });

  it('in a serial room a second round waits behind the running turn, not beside it', async () => {
    const h = build({ manual: true, settings: { serial: true } });
    await h.service.sendMessage('第一轮');
    expect(h.runtime.wakes).toEqual([keyOf('claude')]);
    const claude = await h.runtime.activated(keyOf('claude'));

    // The person's second message opens round 2 while round 1's seat is still
    // running: it queues behind the room's one activation slot.
    await h.service.sendMessage('第二轮');
    expect(h.runtime.wakes).toEqual([keyOf('claude')]);

    await claude.end();
    // The queue is the room's, in seat order: codex — round 1's next entry —
    // wakes, and round 2's members stay queued.
    expect(h.runtime.wakes).toEqual([keyOf('claude'), keyOf('codex')]);

    const codex = await h.runtime.activated(keyOf('codex'));
    await codex.end();
    const opencode = await h.runtime.activated(keyOf('opencode'));
    await opencode.end();
    // Round 1 ran its seats; claude's round-2 entry is next, and after it the
    // queue is drained — one activation at a time throughout.
    expect(h.runtime.wakes.slice(1)).toEqual([
      keyOf('codex'),
      keyOf('opencode'),
      keyOf('claude'),
    ]);
    const claudeAgain = await h.runtime.activated(keyOf('claude'));
    await claudeAgain.end();
    expect(h.runtime.wakes).toHaveLength(4);
  });

  it('re-tags a queued member to the newer round, so an exhausted round cannot drop its wake', async () => {
    const h = build({ manual: true, settings: { serial: true, roundBudget: 2 } });
    await h.service.sendMessage('第一轮');
    expect(h.runtime.wakes).toEqual([keyOf('claude')]);
    const claude = await h.runtime.activated(keyOf('claude'));

    // Round 2 while claude still runs: codex and opencode are queued for
    // round 1, and their entries take the newer round's tag.
    await h.service.sendMessage('第二轮');
    await claude.end();

    // Round 1's budget holds only claude's wake. The queue walks on into
    // round 2: both queued members run, and opencode sees message 2.
    const codex = await h.runtime.activated(keyOf('codex'));
    await codex.end();
    const opencode = await h.runtime.activated(keyOf('opencode'));
    await opencode.end();
    expect(h.runtime.wakes).toEqual([
      keyOf('claude'),
      keyOf('codex'),
      keyOf('opencode'),
    ]);
  });

  it('logs an activation that failed before it was a turn and keeps the serial queue moving', async () => {
    const h = build({ manual: true, settings: { serial: true } });
    await h.service.sendMessage('报数');
    expect(h.runtime.wakes).toEqual([keyOf('claude')]);

    // The runtime's report: the activation died before a harness existed.
    h.service.activationFailed('claude', 'no agent claude in the registry');
    expect(h.turnLog.rows[0]).toMatchObject({
      agentId: 'claude',
      outcome: 'failed',
      error: 'no agent claude in the registry',
      roundSeq: 0,
    });
    // The queue moved on instead of waiting for an afterTurn that never comes.
    expect(h.runtime.wakes).toEqual([keyOf('claude'), keyOf('codex')]);
  });

  it('offers no room_dm inside a private room: the pair is already alone', async () => {
    const dm: RoomDmGateway = { open: async () => ({ roomId: 'r_child00000', seq: 1 }) };
    const privateRoom = build({ manual: true, dm, parentTitle: () => '大房间' });
    await privateRoom.service.sendMessage('单独聊');
    await privateRoom.runtime.activated(keyOf('claude'));
    expect(privateRoom.tools.at(-1)!.map(tool => tool.name)).not.toContain('room_dm');

    const rootRoom = build({ manual: true, dm });
    await rootRoom.service.sendMessage('再聊');
    await rootRoom.runtime.activated(keyOf('claude'));
    expect(rootRoom.tools.at(-1)!.map(tool => tool.name)).toContain('room_dm');
  });

  it('denies writes outside cwd, writes that name no location, and symlinks out of cwd', async () => {
    const h = build({ manual: true });
    await h.service.sendMessage('写点什么');
    const claude = await h.runtime.activated(keyOf('claude'));
    const decide = claude.harness.permissions;
    const options = [
      { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' as const },
      { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' as const },
    ];
    const ask = (toolCall: Record<string, unknown>) =>
      decide({
        sessionId: 'session-1',
        toolCall: toolCall as never,
        options,
      });

    // Inside cwd — resolved through symlinks, so a /tmp aliasing /private/tmp
    // on this machine is no obstacle — a write is allowed.
    const inside = await ask({
      toolCallId: 'c1',
      kind: 'edit',
      locations: [{ path: join(claude.harness.cwd, 'note.md') }],
    });
    expect(inside).toEqual({ outcome: 'selected', optionId: 'allow-once' });

    // Outside cwd, denied — and a symlink that lives inside but points out
    // is judged by where it points.
    const outside = await ask({
      toolCallId: 'c2',
      kind: 'edit',
      locations: [{ path: join(tmpdir(), 'rivus-elsewhere', 'note.md') }],
    });
    expect(outside).toEqual({ outcome: 'selected', optionId: 'reject-once' });
    const escape = mkdtempSync(join(tmpdir(), 'rivus-escape-'));
    const link = join(claude.harness.cwd, 'escape.md');
    symlinkSync(join(escape, 'target.md'), link);
    const viaLink = await ask({ toolCallId: 'c3', kind: 'edit', locations: [{ path: link }] });
    expect(viaLink).toEqual({ outcome: 'selected', optionId: 'reject-once' });

    // A write-kind call that names no location is denied by default, not
    // waved through as harmless; a location-less execute still runs.
    const noLocations = await ask({ toolCallId: 'c4', kind: 'edit' });
    expect(noLocations).toEqual({ outcome: 'selected', optionId: 'reject-once' });
    const bareExecute = await ask({ toolCallId: 'c5', kind: 'execute' });
    expect(bareExecute).toEqual({ outcome: 'selected', optionId: 'allow-once' });

    // A name that starts with two dots is an ordinary in-root name, not a
    // parent hop; a relative path names no place the room gave; a chain of
    // links longer than the walker follows is denied rather than handed to
    // the OS to finish.
    writeFileSync(join(claude.harness.cwd, '..dots.md'), 'x', 'utf8');
    const dotDots = await ask({
      toolCallId: 'c6',
      kind: 'edit',
      locations: [{ path: join(claude.harness.cwd, '..dots.md') }],
    });
    expect(dotDots).toEqual({ outcome: 'selected', optionId: 'allow-once' });
    const relative = await ask({ toolCallId: 'c7', kind: 'edit', locations: [{ path: 'note.md' }] });
    expect(relative).toEqual({ outcome: 'selected', optionId: 'reject-once' });
    const chainEnd = mkdtempSync(join(tmpdir(), 'rivus-chain-end-'));
    let chainLink: string = join(chainEnd, 'far.md');
    for (let index = 0; index < 45; index += 1) {
      const next = join(claude.harness.cwd, `l${index}`);
      symlinkSync(chainLink, next);
      chainLink = next;
    }
    const viaChain = await ask({ toolCallId: 'c8', kind: 'edit', locations: [{ path: chainLink }] });
    expect(viaChain).toEqual({ outcome: 'selected', optionId: 'reject-once' });

    await claude.end();
  });
});

describe('RoomService pass cursor', () => {
  /**
   * The lease as the release race sees it: a write fences only while the key
   * is held, and every step lands in `events` for the test to read the order
   * back. The refusal is the control plane's own conflict error, as the real
   * `LeaseManager.fence` throws one.
   */
  class TurnLease implements RoomLeases {
    readonly events: string[] = [];
    private readonly held = new Set<string>();

    fence<T>(key: string, op: () => Promise<T>): Promise<T> {
      if (!this.held.has(key)) {
        return Promise.reject(new OrchestrationConflictError(key));
      }
      this.events.push(`write:${key}`);
      return op();
    }

    read(key: string): LeaseRecord | undefined {
      return this.held.has(key)
        ? { key, holderPid: 1, holderId: 'test', heartbeatAt: '' }
        : undefined;
    }

    acquire(key: string): void {
      this.held.add(key);
      this.events.push(`acquire:${key}`);
    }

    release(key: string): void {
      if (this.held.delete(key)) this.events.push(`release:${key}`);
    }
  }

  /**
   * One activation, run the way the runtime runs it: lease in, harness, the
   * afterTurn hook's promise awaited, lease out — the activation order the
   * design fixes.
   */
  async function runTurn(
    h: Built,
    lease: TurnLease,
    agentId: string,
    result?: { stopReason?: string | null; error?: string },
  ): Promise<void> {
    const key = keyOf(agentId);
    lease.acquire(key);
    const harness = await h.service.activate(agentId as RoomLabAgentId);
    await harness.hooks?.afterTurn?.({
      stopReason: (result?.stopReason ?? 'end_turn') as 'end_turn',
      timedOut: result?.stopReason === null && !result?.error,
      token: TOKEN,
      ...(result?.error ? { error: result.error } : {}),
    });
    lease.release(key);
  }

  it('advances the cursor to read_up_to_seq, releasing the lease only after the pass lands', async () => {
    const lease = new TurnLease();
    const h = build({ manual: true, lease });
    await h.service.sendMessage('先看记录');
    await runTurn(h, lease, 'claude');

    expect(h.store.inspectSession(sessionId('claude'))?.seenSeq).toBe(1);
    expect(h.turnLog.rows[0]).toMatchObject({ agentId: 'claude', outcome: 'passed' });
    // The write point ran inside the held window: acquire, pass, then release.
    expect(lease.events).toEqual([
      `acquire:${keyOf('claude')}`,
      `write:${keyOf('claude')}`,
      `release:${keyOf('claude')}`,
    ]);
  });

  it('shows a pass that lost its lease in the turn row and the log, not silence', async () => {
    const lease = new TurnLease();
    const h = build({ manual: true, lease });
    await h.service.sendMessage('先看记录');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // The race the old release ordering caused: the lease is gone by the
    // time the pass fences.
    lease.acquire(keyOf('claude'));
    const harness = await h.service.activate('claude');
    lease.release(keyOf('claude'));
    await harness.hooks?.afterTurn?.({ stopReason: 'end_turn', timedOut: false, token: TOKEN });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('pass lost for @claude'));
    errorSpy.mockRestore();

    expect(h.store.inspectSession(sessionId('claude'))?.seenSeq).toBe(0);
    expect(h.turnLog.rows[0]).toMatchObject({ agentId: 'claude', outcome: 'failed' });
    expect(h.turnLog.rows[0]?.error).toMatch(/already occupied/);
  });
});

describe('RoomService pass cursor on sqlite', () => {
  it('lands the pass on the real adapter: the cursor row agrees with read_up_to_seq', async () => {
    const store = SqliteRoomStore.memory();
    // The room row first: room_events carries a foreign key to it.
    const catalog = new RoomCatalog([], undefined, store.agents);
    catalog.create({ id: 'r_5e1ec0de5a', title: 'sqlite 房间', now: '2026-09-29T00:00:00.000Z', memberIds: ['claude'] });
    store.saveRoom(catalog.get('r_5e1ec0de5a'));
    const stream = store.stream('r_5e1ec0de5a');
    const lease = new LeaseManager({
      store: new SqliteLeaseStore(store.db),
      clock: nodeClock,
      identity: { pid: process.pid },
      holderId: 'test-holder',
      liveness: nodeLiveness,
    });
    const service = new RoomService({
      roomId: { tenantId: 'local', conversationId: 'r_5e1ec0de5a' },
      store: stream,
      registry: {
        get: async id => agentOf(id, ''),
        list: async () => [agentOf('claude', '')],
        save: async () => {},
        remove: async () => {},
      },
      runtime: { wake: () => undefined },
      lease,
      turnLog: new SqliteTurnLog(store.db),
      members: () => ['claude'],
      agents: () => [{ id: 'claude', label: 'Claude', role: '成员', color: 1 }],
      settings: () => ({ wake: 'broadcast', serial: false }),
      roomTitle: () => 'sqlite 房间',
      workRoot: () => mkdtempSync(join(tmpdir(), 'rivus-room-sqlite-')),
    });
    await service.sendMessage('sqlite 里的第一问', 'web:sqlite-pass-1');

    // One activation, the way the runtime runs it: lease in, the afterTurn
    // hook's promise awaited, lease out.
    const key = runtimeKey('r_5e1ec0de5a', 'claude');
    lease.acquire(key);
    const harness = await service.activate('claude');
    await harness.hooks?.afterTurn?.({ stopReason: 'end_turn', timedOut: false, token: TOKEN });
    lease.release(key);

    // The rows the E2E cross-check compared: the turn row's read_up_to_seq
    // and the session's seen_seq. The defect left them apart; they agree now.
    const turn = store.db.prepare(`
      SELECT read_up_to_seq, outcome, error FROM turns WHERE room_id = 'r_5e1ec0de5a'
    `).get() as unknown as { read_up_to_seq: number; outcome: string; error: string | null };
    const cursor = store.db.prepare(`
      SELECT seen_seq FROM agent_sessions WHERE room_id = 'r_5e1ec0de5a' AND agent_id = 'claude'
    `).get() as unknown as { seen_seq: number };
    expect(Number(turn.read_up_to_seq)).toBe(1);
    expect(Number(cursor.seen_seq)).toBe(1);
    expect(turn.outcome).toBe('passed');
    expect(turn.error).toBeNull();
    // The lease row is gone: the release followed the fenced write.
    expect(lease.read(key)).toBeUndefined();
  });
});

describe('RoomService truncated inbox', () => {
  /** A record with `extra` unread events past the turn budget, all by claude. */
  async function longRecord(h: Built, extra: number): Promise<void> {
    await h.service.sendMessage('长记录');
    for (let index = 0; index < extra; index += 1) {
      const head = (await h.store.readSlice(ROOM, 0, { maxEvents: 1 })).head;
      const result = await h.store.speak({
        session: sessionId('claude'),
        body: `第 ${index + 2} 句`,
        addressedTo: [],
        readUpToSeq: head,
        triggerSeq: head,
      });
      if (result.outcome !== 'posted') throw new Error('the seed post should have gone through');
    }
  }

  it('stands the cursor on the last seq the turn carried, not the head', async () => {
    const h = build({ manual: true, members: ['claude', 'codex'] });
    await longRecord(h, 59); // head 60, codex's cursor 0: sixty unread.

    const codex = await h.runtime.activated(keyOf('codex'));
    const texts = codex.harness.blocks.map(block => ('text' in block ? block.text : ''));
    // Fifty carried, ten left out — and the transcript says so.
    expect(texts[1]).toContain('[seq 50]');
    expect(texts[1]).not.toContain('[seq 51]');
    expect(texts[1]).toContain('10 more unread events follow seq 50');

    // A speak is HELD against the events the turn never read — the newer
    // list starts where the inbox stopped — not let past by a cursor that
    // claims the whole record.
    const held = await codex.speakTool()
      .handler({ body: '我的结论', addressedTo: [] }, { sessionId: undefined }) as {
        held?: { newer: ToolEvent[] };
      };
    expect(held.held?.newer.map(event => event.seq)).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);

    // A room_read that skips ahead of the cursor returns its events but
    // advances the handle nowhere: the gap stays honestly unread.
    const read = h.toolOf('codex', 'room_read');
    const skipped = await read.handler({ afterSeq: 55 }, { sessionId: undefined }) as { events: ToolEvent[] };
    expect(skipped.events.map(event => event.seq)).toEqual([56, 57, 58, 59, 60]);
    await codex.end();
    expect(h.store.inspectSession(sessionId('codex'))?.seenSeq).toBe(50);

    // The next turn carries exactly what was left, and its pass stands on it.
    const again = await h.runtime.activated(keyOf('codex'));
    const againTexts = again.harness.blocks.map(block => ('text' in block ? block.text : ''));
    expect(againTexts[1]).toContain('[seq 51]');
    expect(againTexts[1]).not.toContain('[seq 50]');
    await again.end();
    expect(h.store.inspectSession(sessionId('codex'))?.seenSeq).toBe(60);
  });
});

describe('RoomService reset', () => {
  const RESET_ROOM = 'r_deadbeef00';

  interface SqliteOptions {
    /** The child rooms the host would list, and how it would open them. */
    childRooms?: () => readonly string[];
    resetChild?: (roomId: string) => { reset(): Promise<unknown> } | undefined;
  }

  async function buildOnSqlite(roundBudget: number, options: SqliteOptions = {}): Promise<{
    store: SqliteRoomStore;
    turnLog: SqliteTurnLog;
    service: RoomService;
    wakes: string[];
    /** The Room tool definitions of each activation, in activation order. */
    tools: ToolDefinition[][];
    toolOf(agentId: string, name: string): ToolDefinition;
  }> {
    const store = SqliteRoomStore.memory();
    const catalog = new RoomCatalog([], undefined, store.agents);
    catalog.create({
      id: RESET_ROOM,
      title: '重置房间',
      now: '2026-09-29T00:00:00.000Z',
      memberIds: ['claude', 'codex'],
    });
    store.saveRoom(catalog.get(RESET_ROOM));
    const turnLog = new SqliteTurnLog(store.db);
    const wakes: string[] = [];
    const tools: ToolDefinition[][] = [];
    const toolsByAgent = new Map<string, ToolDefinition[]>();
    const service = new RoomService({
      roomId: { tenantId: 'local', conversationId: RESET_ROOM },
      store: store.stream(RESET_ROOM),
      registry: {
        get: async id => agentOf(id, ''),
        list: async () => [agentOf('claude', ''), agentOf('codex', '')],
        save: async () => {},
        remove: async () => {},
      },
      runtime: { wake: key => wakes.push(key) },
      lease: { fence: (_key, op) => op(), read: () => undefined },
      turnLog,
      members: () => ['claude', 'codex'],
      agents: () => [
        { id: 'claude', label: 'Claude', role: '成员', color: 1 },
        { id: 'codex', label: 'Codex', role: '成员', color: 2 },
      ],
      settings: () => ({ wake: 'broadcast', serial: false, roundBudget }),
      roomTitle: () => '重置房间',
      workRoot: () => mkdtempSync(join(tmpdir(), 'rivus-room-reset-')),
      toolHost: async ({ agentId, tools: definitions }) => {
        tools.push(definitions);
        toolsByAgent.set(agentId, definitions);
        return {
          endpoint: {} as unknown as McpServer,
          url: 'http://127.0.0.1:0/mcp',
          serveTurn: () => undefined,
          close: async () => {},
        };
      },
      ...(options.childRooms ? { childRooms: options.childRooms } : {}),
      ...(options.resetChild ? { resetChild: options.resetChild } : {}),
    });
    return {
      store,
      turnLog,
      service,
      wakes,
      tools,
      toolOf: (agentId, name) => {
        const found = toolsByAgent.get(agentId)?.find(definition => definition.name === name);
        if (!found) throw new Error(`no ${name} tool on ${agentId}'s latest turn`);
        return found;
      },
    };
  }

  it('clears the log and the budget with the record, and stops the turns still running', async () => {
    const { store, turnLog, service, wakes } = await buildOnSqlite(2);
    await service.sendMessage('第一轮', 'web:reset-1');
    expect(wakes).toEqual([runtimeKey(RESET_ROOM, 'claude'), runtimeKey(RESET_ROOM, 'codex')]);

    // Claude's turn passes; codex's stays open — the case a reset interrupts.
    const claude = await service.activate('claude');
    await claude.hooks?.afterTurn?.({ stopReason: 'end_turn', timedOut: false, token: TOKEN });
    const codex = await service.activate('codex');
    expect(turnLog.listByRoom(RESET_ROOM)).toHaveLength(1);

    await service.reset();
    // The record is empty; the log that described it is too.
    const cleared = await store.stream(RESET_ROOM)
      .readSlice({ tenantId: 'local', conversationId: RESET_ROOM }, 0, { maxEvents: 10 });
    expect(cleared.events).toEqual([]);
    expect(cleared.head).toBe(0);
    expect(turnLog.listByRoom(RESET_ROOM)).toEqual([]);

    // The interrupted turn ends as a failure of the reset, and its pass marks
    // nothing read in the record that replaced the one it ran against.
    await codex.hooks?.afterTurn?.({ stopReason: 'end_turn', timedOut: false, token: TOKEN });
    const rows = turnLog.listByRoom(RESET_ROOM);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentId: 'codex',
      outcome: 'failed',
      error: 'room was reset during this turn',
    });
    const cursor = store.db.prepare(`
      SELECT seen_seq FROM agent_sessions WHERE room_id = ? AND agent_id = 'codex'
    `).get(RESET_ROOM) as unknown as { seen_seq: number };
    expect(Number(cursor.seen_seq)).toBe(0);

    // The budget went with the log: the next round wakes the full roster
    // again under the same limit that had just been spent.
    await service.sendMessage('第二轮', 'web:reset-2');
    expect(wakes.slice(2)).toEqual([runtimeKey(RESET_ROOM, 'claude'), runtimeKey(RESET_ROOM, 'codex')]);
  });

  it('closes the Room tools of a turn the reset invalidated', async () => {
    const { store, service, toolOf } = await buildOnSqlite(12);
    await service.sendMessage('第一轮', 'web:reset-tools-1');
    const codex = await service.activate('codex');
    const speak = toolOf('codex', 'room_speak');

    // The reset invalidates the turn; the person's next message reopens the
    // record. The tool definitions the activation hosted still exist — the
    // endpoint outlives the turn — so the gate is what has to hold.
    await service.reset();
    await service.sendMessage('第二轮', 'web:reset-tools-2');
    await expect(
      speak.handler({ body: '迟到的发言', addressedTo: [] }, { sessionId: undefined }),
    ).resolves.toEqual({ error: 'turn-closed' });
    // The new record holds only the person's message: nothing posted into it.
    const events = await store.stream(RESET_ROOM)
      .readSlice({ tenantId: 'local', conversationId: RESET_ROOM }, 0, { maxEvents: 10 });
    expect(events.events.map(event => event.kind)).toEqual(['human']);
    await codex.hooks?.afterTurn?.({ stopReason: 'end_turn', timedOut: false, token: TOKEN });
  });

  it('resets child rooms whole when the host wires them, and falls back to clearing their rows', async () => {
    const childReset = vi.fn(async () => undefined);
    const wired = await buildOnSqlite(12, {
      childRooms: () => ['r_feedface00'],
      resetChild: () => ({ reset: childReset }),
    });
    await wired.service.sendMessage('第一轮', 'web:reset-child-1');
    await wired.service.reset();
    expect(childReset).toHaveBeenCalledTimes(1);

    // Without the wiring, the child's turn rows still go with the reset.
    const plain = await buildOnSqlite(12, { childRooms: () => ['r_feedface00'] });
    plain.store.db.prepare(`
      INSERT INTO rooms (id, title, goal, created_at, updated_at, last_opened_at)
      VALUES ('r_feedface00', '子房间', NULL, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z')
    `).run();
    plain.turnLog.append({
      id: 'turn:child', roomId: 'r_feedface00', agentId: 'claude', roundSeq: 1,
      triggerSeq: 1, readUpToSeq: 1, startedAt: '2026-09-30T00:00:00.000Z',
      outcome: 'passed', heldCount: 0,
    });
    await plain.service.reset();
    expect(plain.turnLog.listByRoom('r_feedface00')).toEqual([]);
  });
});
