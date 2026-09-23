# RFC 0015: Agent Collaboration System

| Field | Value |
| --- | --- |
| Status | Draft |
| Date | 2026-09-23 |
| Supersedes | RFC 0013 "Addressing" and "Send lifecycle"; RFC 0010 Chapter B wake policy and the `wake-on-peer-posts` knob |
| Related | RFC 0010 (team runtime), RFC 0011 (orchestration kernel), RFC 0012 (domain layout), RFC 0014 (task board) |

## Summary

A Room works the way a group chat works for people. Every member sees every
message. Each member decides alone whether to act. A member that acts works in
private and then says one thing through the Room, or says nothing. Nothing
schedules turns. The record is the only shared context. The runtime guarantees
one thing: a member runs one session at a time.

This RFC derives the whole system from that picture. It gives each package one
question to answer, fixes the storage, walks through four scenarios, and lists
what is deleted. It replaces the server loop that today decides who runs and
who speaks, the count-off aggregate built around that loop, and stdout scraping
as the way an agent's words enter the Room.

## The problem

| Today | Why it fails the picture |
| --- | --- |
| `RoomLabService.sendMessage` filters the woken members, then a `for` loop runs them one at a time and posts each result | Turn order is a server decision. A member cannot decline: being called means answering. HELD almost never fires because nothing is ever concurrent |
| `createLocalAgentRunner` spawns `zsh -lic '<command> "$1"'` and posts `stdout` | The agent never chose to speak. Banners have to be scrubbed, progress and answer are one string, and a peer cannot be addressed |
| `CountOffRun`, `runCountOff`, `CountOffStrip`, `round.ts` | A product scenario became a domain aggregate. Counting off is what happens when members read before speaking; it is not a feature |
| `shouldWake` returns `false` for every agent-authored event; `replyInSerial` hardcodes `addressedTo: []` | Members cannot hear each other, so one cannot hand work to another |
| `@rivus/agent-orchestration` reaches the web app as two type imports | The kernel meant to guarantee one session per member is bypassed by the loop above |
| `room_workspace` persists a JSON snapshot of service state on every change | It duplicates `room_members`, caches derivable status, and was the source of the membership-loss bug fixed on 2026-09-21 |
| The design lives in four RFCs and several conversations | No document states the system as one thing |

## First principles

Start from what a person does in a group chat. Keep only what survives when
the person is a program.

1. **One record.** Append-only, totally ordered, shared. Whatever a member
   needs to know about the others is in it. There is no second channel: no
   blackboard, no mail, no shared draft.
2. **Members are peers.** A person and an agent hold the same rights: read the
   record, speak into it. They differ in transport, not in protocol.
3. **Seeing is not speaking.** Every member sees every event. Speaking is the
   member's decision. Silence is a legitimate outcome and is recorded as "read
   up to here".
4. **Work is private, results are public.** What a member does between reading
   and speaking is its own business: files, tools, other systems. Only the
   message enters the record. Progress is not a message.
5. **A member is single-threaded.** At most one session per member per Room at
   any time, as a person cannot answer two things at once.
6. **Order is derived, not scheduled.** Whose turn it is is whatever the record
   shows. Running members one at a time is a scheduling option the endpoint may
   switch on; it is not a rule of the protocol.
7. **Attention is bounded.** A chain of members waking each other terminates by
   construction.
8. **Mechanism below, policy above.** The packages know nothing about
   count-offs, roles, tasks, or products. Everything with a product name lives
   in the endpoint.

Each principle fixes a rule:

| Principle | Rule |
| --- | --- |
| 1 | `room_workspace`, orchestration `facts` and `mail`, and the RFC 0013 工作稿 are gone. A member that wants others to know something posts it |
| 2 | The write point is the same function for a person's message and an agent's. Only the caller differs |
| 3 | A wake produces a turn. A turn ends in `speak` or `pass`. Both advance the member's cursor |
| 4 | An agent speaks by calling a Room tool. Text it prints and does not send is not posted. There is no stdout fallback |
| 5 | One lease per (room, member) in the control plane. A wake for a member that holds a lease is coalesced into one pending wake: not dropped, not queued |
| 6 | `shouldWake` is a broadcast. The endpoint's `serial` switch runs the woken set one member at a time in seat order; the protocol does not change |
| 7 | Every event carries a wake depth. Two bounds apply: a depth ceiling and a turn budget per round |
| 8 | Record, cursor, write points, wake rule: `agent-room`. Lease, connection: `agent-orchestration`. Count-off, roles, system prompts, the serial switch: endpoint |

## Vocabulary

| Term | Meaning |
| --- | --- |
| Room | One named group chat: a record plus a member list |
| Record | The Room's ordered events. `seq` is identity |
| Event | One entry: a human message, a member post, or a control-plane notice |
| Member | A participant with a cursor. A person, or a row in the `agents` table |
| Wake | The decision that a member should look at the record after an event |
| Turn | One member session started by a wake. It ends in speak or pass |
| Speak | The write point that appends a member post |
| Pass | The write point that advances a cursor without a post |
| HELD | The write point's refusal because the record moved past what the member has read. The newer events come back with it |
| Round | The tree of events under one human event |
| Depth | Distance from the human event that opened the round |
| Lease | The control plane's record that one session of a member is running |
| Connector | How the control plane talks to an agent process. ACP |
| Endpoint | A projection of the Room with storage and UI. `apps/room-web` |

## Architecture

```text
   person ──────▶ ┌────────────────────────────────────────────────┐
   browser ◀───── │ apps/room-web             (endpoint)           │
                  │ routes · dispatcher · Room tools · rooms.sqlite │
                  └──────────┬──────────────────────┬─────────────┘
                             │                      │
              record, cursors, write points,   lease, connection
              wake rule                        (control plane)
                             │                      │
                ┌────────────▼──────────┐  ┌────────▼──────────────────┐
                │ @rivus/agent-room     │  │ @rivus/agent-orchestration│
                │ ports, no storage     │  │ ports, no storage         │
                └───────────────────────┘  └────────┬──────────────────┘
                                                    │ ACP, stdio
                                     ┌──────────────▼─────────────┐
                                     │ claude-agent-acp           │   Room tools (MCP)
                                     │ codex-acp                  │ ─────────────────▶ back into room-web
                                     │ opencode acp               │
                                     └────────────────────────────┘

   @rivus/agent-task-loop  its own pipeline; borrows the lease, nothing else
```

Each package answers one question:

| Package | Question | Stores |
| --- | --- | --- |
| `@rivus/agent-room` | What was said, who has read up to where, who should look next | Nothing. Ports |
| `@rivus/agent-orchestration` | Who may run right now, and how to talk to it | Nothing. Ports |
| `@rivus/agent-task-loop` | Where is this task in its pipeline | Its own |
| `apps/room-web` | Everything with a product name: member rows, settings, the Room tools, scheduling, UI, storage for the two ports above | `rooms.sqlite` |

Dependency rules, unchanged from RFC 0010:

- `agent-room` and `agent-orchestration` do not import each other.
- `agent-task-loop` may import the lease from `agent-orchestration`. It does not
  import `agent-room`.
- `apps/room-web` is the only place that knows all three.

## `@rivus/agent-room`: the protocol

### Event

```ts
interface RoomEvent {
  seq: RoomSeq;
  roomId: RoomId;
  messageId: string;
  transportMessageId?: string;
  author: { kind: 'human' | 'agent' | 'control-plane'; id: string };
  kind: 'human' | 'posted' | 'control-plane';
  body: string;
  addressedTo: AgentId[];
  wakeDepth: number;            // new: 0 for a human message, trigger + 1 for a post
  origin: 'endpoint' | 'control-plane';
  at: string;
}
```

`companion` leaves `RoomEventKind`. Nothing produces it; it was a Feishu
concept that never reached this repository's endpoints.

### Cursor

`AgentSession` keeps `seenSeq` per (room, member). `heldUpToSeq` is dropped:
HELD is resolved inside the turn (below), so nothing needs to remember it
between turns.

### Write points

| Write point | Caller | Effect |
| --- | --- | --- |
| `admit(event)` | endpoint, for a human message | Append at depth 0. Idempotent on `transportMessageId` |
| `speak({ member, body, addressedTo, readUpToSeq, triggerSeq })` | a member's turn | HELD if any event by another author has `seq > readUpToSeq`. Otherwise append `posted` at `trigger.wakeDepth + 1`, cursor moves to the new seq |
| `pass({ member, readUpToSeq })` | a member's turn ending without a post | Cursor moves to `readUpToSeq`. Never HELD |
| `notice({ body })` | endpoint | Append `control-plane`. Wakes nobody, moves no cursor |

Two changes against today's `replyInSerial` and `completeSilentlyInSerial`:

- `speak` takes `addressedTo` and the seq the turn actually read up to. Today
  it compares against the stored cursor, which is stale for the whole turn.
- `pass` cannot be HELD. Events the member did not read stay ahead of its
  cursor, and the pending-wake rule in the dispatcher brings the member back
  for them. This removes the hold-acknowledge handshake and the
  `heldUpToSeq` state.

### HELD, inside the turn

```text
member calls room_speak(body, readUpToSeq = 12)
  record head is 14, seq 13 and 14 were posted by peers while it worked
  → { held: { newer: [13, 14] } }
member reads 13 and 14, still in the same session
  → room_speak(revised body, readUpToSeq = 14)      posted as seq 15
  or ends the turn without speaking                  pass(readUpToSeq = 14)
```

The write point does not change: the member is refused until it has read
what the room said. What changes is who handles the refusal. Today the server
keeps a draft, builds a special retry prompt, and offers a 读取更新并重答
button. Under this RFC the member handles it, because the member is the one
with the intent. Three HELD results in one turn close the tool; the turn ends
as `pass`. No `agent_drafts`, no retry prompt, no button.

### Wake rule

```ts
function shouldWake(input: { event: RoomEvent; memberId: AgentId; ceiling: number }): boolean {
  const { event, memberId, ceiling } = input;
  if (event.kind === 'control-plane') return false;
  if (event.author.id === memberId) return false;
  return event.wakeDepth < ceiling;
}
```

`WakePolicy` and its two values `mention-only` and `all-human-messages` are
deleted. `@` is content and a UI affordance. It appears in the prompt as
`→ @codex`, and a member is expected to treat it as a strong signal; it is not
a routing rule. A room may opt into `wake = 'addressed'`, under which an event
with a non-empty `addressedTo` wakes only those members. An unaddressed event
still wakes everyone. This is the one cost knob that lives in the protocol,
because it changes who receives the event.

### Bounds

Depth alone does not bound the work, because it does not bound width. Two
limits apply, both room settings with defaults derived from `n`, the member
count when the round opened:

| Bound | Default | Enforced by | Why this number |
| --- | --- | --- | --- |
| Depth ceiling | `2n` | `shouldWake` | A count-off of `n` members is a chain of depth `n`. Twice that leaves room for one reply per step |
| Turns per round | `n(n + 1)` | dispatcher, before starting a turn | Under broadcast every post wakes `n − 1` members. A full count-off is `n²` turns; the budget fits it with `n` to spare |
| Turn timeout | 10 min, member row may override | endpoint watchdog | Real work (editing a repo, writing a document) takes minutes. The old 120 s was sized for one-shot answers |

When the round budget is exhausted the dispatcher posts a `notice` and stops
waking for that round. A person's next message opens a new round.

## `@rivus/agent-orchestration`: the control plane

Two capabilities. Ports only.

### Lease

```ts
export interface LeaseRecord { key: string; holderPid: number; holderId: string; heartbeatAt: string }
export type FencingToken = Pick<LeaseRecord, 'key' | 'holderPid' | 'holderId'>;

export interface LeaseStore {
  tryCreate(key: string, record: LeaseRecord): boolean;
  tryReplace(key: string, expected: LeaseRecord, next: LeaseRecord): boolean;
  tryTouch(expected: LeaseRecord, next: LeaseRecord): boolean;
  tryRelease(expected: LeaseRecord): boolean;
  read(key: string): LeaseRecord | undefined;
  runFenced<T>(token: FencingToken, op: () => Promise<T>, signal?: AbortSignal): Promise<FencedResult<T>>;
}
```

Key shape for a Room: `room:<roomId>:member:<agentId>`. A lease is fresh
while the holder pid is alive and the heartbeat is within `staleAfterMs`;
either failing makes it stale and takeable. `domain/lock.ts` already
implements this and does not change.

`runFenced` is what makes the ACP path safe: a turn `await`s `prompt(...)` for
minutes, and the lease can be lost across that await. The write into the
record runs inside `runFenced`; a holder that lost its lease gets
`{ executed: false }` and its result never lands.

### Connection

```ts
export interface AgentBinding { command: string; args?: string[]; env?: Record<string, string> }

export interface AgentConnector {
  connect(binding: AgentBinding): Promise<AgentConnection>;
}

export interface AgentConnection {
  newSession(input: { cwd: string; mcpServers?: McpServer[] }): Promise<SessionId>;
  prompt(session: SessionId, blocks: ContentBlock[], signal?: AbortSignal): Promise<{ stopReason: StopReason }>;
  cancel(session: SessionId): Promise<void>;
  onUpdate(handler: (update: SessionUpdate) => void): Unsubscribe;
  close(): Promise<void>;
}
```

`AcpConnector` is the one implementation on the main path, built on
`@agentclientprotocol/sdk` 1.5.0. Verified against the published schema on
2026-09-23: `session/new` takes `cwd` and `mcpServers` (`stdio`, `http`, or
`acp` transport); `session/prompt` resolves with a `stopReason` of `end_turn`,
`max_tokens`, `max_turn_requests`, `refusal`, or `cancelled`; `session/update`
streams `agent_message_chunk`, `tool_call_update`, `plan_update`, and the
rest.

| Member | Channel | Verified 2026-09-23 |
| --- | --- | --- |
| claude | `@agentclientprotocol/claude-agent-acp` | 0.81.0, built on the Claude Agent SDK, README lists client MCP servers |
| codex | `@agentclientprotocol/codex-acp` | 1.13.0, maintained by the ACP organisation |
| opencode | `opencode acp` | native subcommand in the installed binary |

The process is long-lived per member and reused across turns. The session is
new for every turn, so the record is the only context a turn carries in.
A persistent session would be a second memory the record cannot show;
see Alternatives.

A member whose command has no ACP channel cannot receive the Room tools, so
it cannot speak, so it cannot be seated. The agents page shows such a row as
不可入座 rather than seating a member that can only listen. `dsh` is in that
position until it has a channel; see Risks.

### AgentRuntime

```ts
runTurn(input: {
  leaseKey: string;
  binding: AgentBinding;
  cwd: string;
  mcpServers: McpServer[];
  blocks: ContentBlock[];
  signal?: AbortSignal;
  onUpdate?: (update: SessionUpdate) => void;
}): Promise<{ stopReason: StopReason } | { skipped: 'lease-held' }>
```

Acquire the lease, connect or reuse the process, `newSession`, `prompt`,
release. Heartbeats run while `prompt` is pending. The caller wraps its writes
in `runFenced` with the token `runTurn` hands back.

### What leaves the package

| Today | Disposition |
| --- | --- |
| `domain/run.ts`, `Run`, `RunSnapshot`, `ObservedRun`, seats, `allowed` | Move to `agent-task-loop`. The impl/review baton is the task pipeline's own turn-taking and has no second user |
| `domain/template.ts`, `TemplateSpec`, `CLASSIC_DELIVERY_TEMPLATE` | Move to `agent-task-loop`, same reason |
| `context.facts`, `context.mail` | Delete. Principle 1 |
| `ProcessRunner`, `execa-runner.ts` | Move to `agent-task-loop` with `Run`. One-shot spawn is how its seats run today |
| `infrastructure/file-store.ts` | Reduce to `FileLeaseStore`: leases only, no run state. `agent-task-loop` keeps using it across the CLI and TUI processes |
| `application/orchestration.ts` facade | Replace with `LeaseManager` and `AgentRuntime` |

```text
packages/agent-orchestration/src/
  contracts/lease.ts           LeaseStore, LeaseRecord, FencingToken, FencedResult
  contracts/connection.ts      AgentBinding, AgentConnector, AgentConnection, SessionUpdate
  domain/lock.ts               isLockFresh, holdsLock (unchanged)
  application/lease-manager.ts acquire, heartbeat, fence, release
  application/agent-runtime.ts runTurn
  infrastructure/acp-connector.ts
  infrastructure/memory-lease-store.ts
  infrastructure/file-lease-store.ts
  infrastructure/node-{clock,identity,liveness,scheduler}.ts
```

## `@rivus/agent-task-loop`

The pipeline does not change. The package takes ownership of `Run`,
templates, `allowed`, and `ProcessRunner`, and keeps `agent-orchestration`
for the lease and fence around `task:<taskId>`, exactly as RFC 0011 wired it.
It does not import `agent-room`. A task run that opens a Room for its
participants is a later RFC.

## `apps/room-web`: the endpoint

### Member row

`agents` gains two columns. `command` becomes the ACP command line
(`claude-agent-acp`, `codex-acp`, `opencode acp`), still run through the
person's login shell so an alias counts.

| Column | Meaning |
| --- | --- |
| `connector` | `acp`. Reserved for a second connector kind; there is none today |
| `timeout_ms` | Per-member turn timeout. NULL means the room default |

### Room settings

| Column | Meaning | Default |
| --- | --- | --- |
| `wake` | `broadcast` or `addressed` | `broadcast` |
| `serial` | Run the woken set one member at a time in seat order | off |
| `depth_ceiling` | See Bounds | NULL, meaning `2n` |
| `round_budget` | See Bounds | NULL, meaning `n(n + 1)` |
| `cwd` | Where members work during a turn | NULL, meaning `~/.rivus/room-web/v1/work/<roomId>` |

`cwd` is a directory, not a channel. If a room is about a repository, its
members work in that checkout. Anything a member wants the others to know
still goes through `speak`.

### Dispatcher

```text
on event e admitted or posted:
  round  = e.wakeDepth == 0 ? open(e.seq) : round of e.trigger
  wanted = members.filter(m => shouldWake(e, m, ceiling(room)))
           filtered again by wake = 'addressed' when e.addressedTo is non-empty
  if room.serial: run wanted in seat order, one at a time
  else:           run wanted concurrently

start(m, trigger):
  if round.turns >= budget:   notice('本轮已达调用上限'); return
  if lease(m) is held:        pending[m] = true; return
  round.turns += 1
  X      = record head
  slice  = events after cursor(m) up to X, budget 50 events / 48k chars
  token  = new turn token bound to (room, m, X, trigger.seq, lease)
  result = runtime.runTurn({ leaseKey, binding(m), cwd(room), mcpServers: [roomTools(token)], blocks(m, slice, trigger) })
  if the turn did not call room_speak:  fence(() => pass(m, X))
  log the turn
  if pending[m] and head > cursor(m):   pending[m] = false; start(m, latest event)
```

Coalescing is what keeps principle 5 and principle 3 both true: a busy member
misses no event, and it never runs two sessions. `serial` changes only the
loop in the first block.

### Room tools

room-web hosts one MCP server per running turn at
`http://127.0.0.1:3210/rooms/:roomId/turns/:token/mcp` and passes it in
`session/new` as an `http` MCP server. For an adapter that does not advertise
`mcpCapabilities.http`, a stdio shim in this repository proxies to the same
URL. The token is random per turn, bound to the member, the seq the turn read
up to, and the lease token; it stops working when the turn ends.

| Tool | Returns |
| --- | --- |
| `room_speak({ body, addressedTo? })` | `{ posted: { seq } }`, `{ held: { newer: Event[] } }`, or an error: `turn-closed`, `already-spoke`, `held-limit` |
| `room_read({ afterSeq?, limit? })` | Events, for a truncated slice or after a HELD |

One post per turn. Everything else a member can do (files, shell, a document
service) is its own tooling, configured on its command, not by the Room. This
is how a member writes a document directly and posts the link: principle 4.

### The turn prompt

Four blocks, in this order:

1. The member's `system_prompt` from its row. How to answer is the member's
   own metadata, as RFC 0013 decided.
2. Room facts: `You are @codex (Codex), member 2 of 3 in room "…". Members in
   seat order: @claude, @codex, @opencode. You were woken by seq 7 from @claude.`
3. The slice, one line per event:
   `[seq 7] @claude → @codex: …`, with `(you)` on the member's own lines.
4. The instruction: `Read first. If you have something to add, call room_speak
   once. If not, end your turn without calling it. Text you print without
   room_speak is not sent.`

Block 2 is all a count-off needs: the member knows its number and reads
whether the number before it has been said.

### Member status in the UI

Derived from the lease, the ACP update stream, and the `turns` table. It is
not stored as truth and never enters the record.

| Shown | Source |
| --- | --- |
| 在场 | No lease |
| 阅读中 | Lease held, no `tool_call_update` yet |
| 工作中 | `tool_call_update` received |
| 已发言 / 未发言 | Last turn outcome `posted` / `passed` |
| 超时 / 失败 | Last turn outcome `timeout` / `failed` |

HELD is not shown to the person. It happens inside a turn and resolves there.
Per RFC 0013 the composer stays usable while members run; the `busy` lock on
`RoomLabService` goes with the loop.

### Product surfaces that go

检查连接 and its strip, 读取更新并重答, and the count-off read model. A
person who wants a count-off types 报数. If the UI wants to show a round, it
derives one from `turns` grouped by `round_seq`.

## Storage

One database, `~/.rivus/room-web/v1/rooms.sqlite`, one migration chain. Four
new versions.

```sql
-- 0004: the record carries depth; addressed_to is now also written by member posts
ALTER TABLE room_events ADD COLUMN wake_depth INTEGER NOT NULL DEFAULT 0;

-- 0005: room settings and member connection
ALTER TABLE rooms  ADD COLUMN wake          TEXT    NOT NULL DEFAULT 'broadcast';
ALTER TABLE rooms  ADD COLUMN serial        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms  ADD COLUMN depth_ceiling INTEGER;
ALTER TABLE rooms  ADD COLUMN round_budget  INTEGER;
ALTER TABLE rooms  ADD COLUMN cwd           TEXT;
ALTER TABLE agents ADD COLUMN connector     TEXT    NOT NULL DEFAULT 'acp';
ALTER TABLE agents ADD COLUMN timeout_ms    INTEGER;

-- 0006: control plane and turn log
CREATE TABLE member_leases (
  key          TEXT PRIMARY KEY,          -- room:<roomId>:member:<agentId>
  holder_pid   INTEGER NOT NULL,
  holder_id    TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);

CREATE TABLE turns (
  id             TEXT PRIMARY KEY,
  room_id        TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id       TEXT NOT NULL,
  round_seq      INTEGER NOT NULL,        -- the human event that opened the round
  trigger_seq    INTEGER NOT NULL,        -- the event that woke this member
  read_up_to_seq INTEGER NOT NULL,
  started_at     TEXT NOT NULL,
  ended_at       TEXT,
  outcome        TEXT,                    -- posted | passed | timeout | failed
  posted_seq     INTEGER,
  stop_reason    TEXT,
  held_count     INTEGER NOT NULL DEFAULT 0,
  error          TEXT
);
CREATE INDEX turns_room_started ON turns(room_id, started_at);

-- 0007: the snapshot goes, and so does the hold state
DROP TABLE room_workspace;
ALTER TABLE agent_sessions DROP COLUMN held_up_to_seq;
```

`member_leases` is the `SqliteLeaseStore`'s table. `turns` is the endpoint's
own log; it is what the UI reads for elapsed time, outcomes, and rounds.
`runFenced` on sqlite in one process is a per-key promise chain plus one
re-read of the holder before entering the operation.

Every field of `room_workspace` is accounted for:

| Field | Where it goes |
| --- | --- |
| `composition` | Already in `room_members` |
| `agentState.status` | Derived from the lease and the last row in `turns` |
| `agentState.heldUpToSeq`, `lastDraft`, `retryAttempt` | Gone with server-side HELD handling |
| `agentState.latencyMs`, `error` | `turns.started_at / ended_at`, `turns.error` |
| `countOff` | Gone with the feature |
| `task` | Gone; RFC 0014 owns tasks and the room shows none |
| `messageCounter`, `countOffCounter`, `taskCounter` | Derived from `max(seq)`, or gone |

## Walkthroughs

### A question, two answers

Three members: @claude, @codex, @opencode. The room is on `broadcast`, not
`serial`.

```text
seq 1  you: 这个接口为什么偶发 502？                    depth 0 → wakes all three
       three turns start in parallel
seq 2  @claude: 看日志是上游超时，重试没退避 …          depth 1 → wakes codex, opencode
       codex calls room_speak(read_up_to = 1) → held { newer: [2] }
       codex reads seq 2; its draft said the same thing → ends turn → pass(2)
       opencode had nothing to add → pass(1)
       the wakes from seq 2 for codex and opencode were coalesced (both were running);
       on release, head (2) > cursor for opencode (1) → one more turn → pass(2)
```

Four turns, one post. Without HELD there would have been two posts saying
the same thing.

### Count-off

```text
seq 1  you: 报数                                        wakes 3
       #1 sees no numbers yet → room_speak("1")         seq 2, depth 1
       #2 sees no "1" yet → pass          #3 → pass
seq 2  wakes #2, #3
       #2 sees "1" → room_speak("2")                    seq 3, depth 2
       #3 sees "1" but no "2" → pass
seq 3  wakes #1, #3
       #3 → room_speak("3")                             seq 4, depth 3
       #1 → pass
seq 4  wakes #1, #2 → both pass
```

Nine turns, three posts, depth 3, no aggregate. With `serial` on, each member
reads the previous post before its turn starts and the same count-off is five
turns. That difference is what the switch is for.

### A handoff

```text
seq 5  you: 把 502 修一下                                            depth 0
seq 6  @claude → @codex: 根因是 …，请在 retry.ts 加指数退避，我来评审。  depth 1
       codex wakes. It edits room.cwd, runs tests, opens a PR. Twelve minutes.
       The UI shows 工作中 from tool_call_update; nothing is posted.
seq 7  @codex → @claude: PR #131，退避 200ms×2^n，上限 5 次。          depth 2
seq 8  @claude: 看过了，两处建议在 PR 里。                              depth 3
       3 is under the ceiling of 6, so codex is woken once more, reads, passes.
```

Nothing in the endpoint knows what a handoff is. Two members read the record
and addressed each other.

### A long piece of work

You ask for a design note. @claude writes it in a document service with its
own tools, which takes twenty minutes, then posts one message with the link.
The room record contains the request and the link. The document is not in the
Room and the Room did not relay it; principle 4.

## Deletions

| Path | Why |
| --- | --- |
| `apps/room-web/app/room-lab/domain/count-off-run.ts` and test | Not a feature |
| `apps/room-web/app/room-lab/domain/held-retry.ts` | HELD resolves in the turn |
| `apps/room-web/app/room-lab/presentation/CountOffStrip.tsx`, `RunStrip.tsx`, `round.ts` | Replaced by `turns` |
| `RoomLabService.runCountOff`, `retryHeld`, `runTask`, the `busy` flag, `turnChain`, `workspaceSnapshot`, `restore` | The loop, its retry, and its snapshot |
| `apps/room-web/app/room-lab/infrastructure/local-agent-runner.server.ts`, `local-task-delivery.server.ts` | Replaced by `AcpConnector`; the fake task loop was already slated for removal by RFC 0014 |
| `count-off`, `retry`, `task` in `RoomLabAction` | No such actions |
| `packages/agent-room/src/wake/domain/wake-policy.ts` `WakePolicy` | One rule remains |
| `packages/agent-orchestration/src/domain/run.ts`, `template.ts`, `execa-runner.ts`, `application/orchestration.ts` | Moved to `agent-task-loop` or replaced |
| `room_workspace` table | Accounted for above |

## Implementation slices

Each is one pull request. Slices 1 and 2 are independent; slice 3 needs both.

| Slice | Package | Content | Proof |
| --- | --- | --- | --- |
| 1 | `agent-room` | `wakeDepth` on the event, `speak` with `addressedTo` and `readUpToSeq`, `pass` without HELD, broadcast `shouldWake` with ceiling, `companion` and `WakePolicy` deleted | Memory store tests: two members speaking concurrently yield one post and one HELD; a depth-`n` chain stops at the ceiling |
| 2 | `agent-orchestration` | `LeaseStore` and `AgentConnector` ports, `AcpConnector`, `AgentRuntime`, memory and file lease stores; `Run`, templates, `ProcessRunner` move to `agent-task-loop` | `agent-task-loop` tests still pass on the moved code; package-boundary test still forbids importing `agent-room` |
| 3 | `room-web` | Migrations 0004–0007, `SqliteLeaseStore`, Room tools endpoint and stdio shim, dispatcher with coalescing and budgets, `turns` log, statuses, room settings, deletions | Three real members, one question and one count-off, `turns` shows the outcomes; typecheck, vitest, build |
| 4 | measurement | Turn count, wall time, and token cost per round under `broadcast` and `serial` with three members | Numbers in the PR, and the default of `serial` decided from them |

## Alternatives considered

**A small model decides who to wake.** Cheaper than broadcast. Rejected for
now because it moves the decision from the member to a hidden component whose
reasoning is not in the record, and a wrong routing is invisible. It may return
as a third value of `wake` if slice 4 shows broadcast is too expensive.

**The turn's final text is the message.** Simpler: no tools. Rejected because
silence would need a sentinel, addressing would need parsing, HELD could not be
shown inside the turn, and the member would never have chosen to speak. It is
the stdout problem with a cleaner transport.

**A persistent session per member per room.** The member would remember its
own past reasoning. Rejected for v1: it is a second context the record cannot
show, and the record can always be re-read. Revisit if turns prove too costly.

**A server-side schedule.** What exists today. Rejected; see The problem.

**A shared draft or workspace.** RFC 0013's 工作稿. Rejected by principle 1.

**One package for the record and the control plane.** Rejected in RFC 0010,
and the reasons stand: a lease is not a write point and a write point is not
a lease.

## Risks

- **Broadcast multiplies turns.** `n²` for a count-off, most of them silent.
  Slice 4 measures it. `serial` and `addressed` are the two knobs, and process
  reuse keeps the fixed cost per turn low.
- **A member that always speaks makes noise.** The tuning point is its own
  row's system prompt; the round budget caps the damage.
- **Silence and failure look alike from outside.** `turns.outcome`
  distinguishes `passed`, `timeout`, and `failed`; the UI must not collapse
  them.
- **The ACP adapters are young.** `claude-agent-acp` is at 0.81 with frequent
  releases. Versions are pinned; the connector is one file.
- **HTTP MCP support varies by adapter.** The stdio shim is the fallback and
  costs one extra process per turn.
- **A member without ACP leaves the roster.** `dsh` today. It returns when it
  has a channel.
- **`runFenced` assumes one room-web process.** A second process against the
  same sqlite is out of scope.

## Decisions recorded

Settled during the 2026-09-22 review, so they are not reopened here:

| Decision |
| --- |
| A Room is a group chat. A member may do a lot of work and comes back to post one message |
| Members push their own messages. No stdout fallback |
| No progress messages in the record |
| The record is the only collaboration context. No shared workspace, no private agent-to-agent channel |
| Every member receives every event and decides alone. Wake is a broadcast |
| A member runs one session at a time. Serial execution is a switch, not the default |
| Agents connect through ACP. Connection is a base capability and belongs in `agent-orchestration` |
| No backward compatibility with the current room-web data path; nobody depends on it |
| Count-off is not a feature. A member knows its number from the room facts and reads before it speaks |
