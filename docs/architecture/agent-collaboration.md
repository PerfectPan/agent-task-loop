# Agent Collaboration

A Room works like a group chat for people. Every member sees every message
and decides alone whether to act. A member that acts works in private and then
says one thing through the Room, or says nothing. Nothing schedules turns; the
record is the only shared context. The runtime guarantees one thing: a member
runs one session at a time.

Three pieces implement this: `@rivus/agent-room` (the protocol),
`@rivus/agent-kit` + `@rivus/agent-kit-collab` (the ACP driving, the
scheduling and the leases), and `apps/room-web` (the endpoint, which owns the
control plane's policy). How to run room-web is in
[`apps/room-web/README.md`](../../apps/room-web/README.md).

## Principles and the rules they fix

| Principle                           | Rule                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rooms are the only channel          | No shared workspace, draft, blackboard, or mail. A member that wants others to know something posts it; a private exchange is a room with fewer members |
| Members are peers                   | The write point is the same for a person's message and an agent's; only the caller differs                                                              |
| Seeing is not speaking              | A wake produces a turn; a turn ends in `speak` or `pass`; both advance the member's cursor                                                              |
| Work is private, results are public | An agent speaks only by calling a Room tool. Printed text is never posted; there is no stdout fallback. Progress is not a message                       |
| A member is single-threaded         | One lane and one lease per (room, member). A wake for a busy member coalesces into one more activation                                                  |
| Order is derived, not scheduled     | `shouldWake` is a broadcast. The room's `serial` switch runs the woken set one at a time in seat order without changing the protocol                    |
| Attention is bounded                | Every event carries a wake depth; a depth ceiling and a per-round turn budget bound the work                                                            |
| Mechanism below, policy above       | The packages know nothing about count-offs, roles, tasks, or products; those live in the endpoint                                                       |

## `@rivus/agent-room`: the protocol

Stores nothing; exposes ports and a memory implementation.

- `RoomEvent`: `seq` (identity inside a room), `author` (`human`, `agent`,
  `control-plane`), `kind` (`human`, `posted`, `control-plane`), `body`,
  `addressedTo`, `wakeDepth` (0 for a human message, trigger + 1 for a post),
  optional `transportMessageId`.
- `AgentSession` keeps `seenSeq` per (room, member).

| Write point                                             | Caller                                          | Effect                                                                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admit(event)`                                          | endpoint, for a human message                   | Append at depth 0; idempotent on `transportMessageId`                                                                                                   |
| `speak({ body, addressedTo, readUpToSeq, triggerSeq })` | a member's turn                                 | HELD, with the newer events, if any event by another author has `seq > readUpToSeq`; otherwise append `posted` at trigger depth + 1 and move the cursor |
| `pass({ readUpToSeq })`                                 | a turn ending without a post                    | Move the cursor; never HELD                                                                                                                             |
| `speak` with `origin: 'control-plane'`                  | endpoint, for a notice such as the round budget | Append a control-plane event, which wakes nobody                                                                                                        |

HELD resolves inside the turn, but a HELD answer does not advance the turn's
`readUpToSeq`. The member must call `room_read` to read what it missed; only a
read that continues from the cursor moves it (`room-tools.server.ts`). A
`room_speak` without that read is HELD again. The third HELD in one turn closes
the tool (`held-limit`), and the turn ends as a pass.

Wake rule: a control-plane event wakes nobody, an event never wakes its own
author, and an event at or above the room's depth ceiling wakes nobody.
Everyone else is woken. A room set to `wake = 'addressed'` wakes only the
addressees of an event with a non-empty `addressedTo`; an unaddressed event
still wakes everyone. `@` is otherwise content: the prompt shows it as
`→ @codex`.

## `@rivus/agent-kit`: the driving, the scheduling, the leases

The kit's entries own the mechanics; the endpoint owns the policy.

- `/acp` (`connectAgent`, `probeAgent`): one ACP process per member, started
  with exactly the environment the member's profile picks from this machine
  (`agentEnv` — nothing is inherited wholesale), one `initialize`, sessions
  created per (room, member). Without a permission callback, or without an
  answer, every permission request is denied: the kit selects the request's
  reject option, or answers `cancelled` when it offers none. The client file
  system is off unless the caller turns it on; room-web turns on both reads
  and writes, and the kit confines them to the session's directory with
  links resolved (a link that points out is judged by where it points).
  `session/cancel` is bounded by a 5 s deadline: a turn that ignores it gets
  its session binding removed and its connection closed.
- The endpoint maps an `agents` row — one command line — onto a kit profile
  (`application/infrastructure/agent-acp.server.ts`): the claude profile
  passes the system prompt through `_meta.systemPrompt`; agents without such
  a channel get it as the first prompt block, once per session. A row no
  profile names gets the generic channels and a fallback environment (the
  PATH/HOME/locale base plus the provider variable families).
- Session bindings: one `FileSessionBindingStoreLive` file next to the rooms
  library, keyed `room:<roomId>:member:<agentId>`. A restart loads the
  session instead of starting a new conversation (`session/load`, falling
  back to a new session when the agent supports no loading).
- `/lanes` (`createLanes`): activations run under a global cap of 16 at
  once, with at most 64 keys queued and one queue entry per key. A wake for
  a running or queued lane coalesces into one pending activation. The turn
  timeout is 10 minutes (an agent row's `timeoutMs` bounds its member
  shorter); the lease, connection and prompt lifecycle live inside the
  endpoint's `activate` Effect. The host assembly root owns one
  `ManagedRuntime`; the wake/cancel callbacks run their Effects on it and
  observe their failures.
- `/lease`: one member lease per key over the kit's SQLite repository (its
  own `member-leases.sqlite` next to the rooms library), renewed every 15 s
  and judged stale after 120 s. A turn's external writes — the pass and the
  speak — run under the kit's per-key fence, so a turn that lost its lease
  lands nothing and a successor's write starts only after the loser settled.

## `apps/room-web`: the endpoint

Local-only React Router app bound to `127.0.0.1`. One database,
`~/.rivus/room-web/v1/rooms.sqlite` (`RIVUS_ROOM_HOME` overrides the
directory), with a forward-only migration chain in
`app/room-lab/infrastructure/migrations/`.

- The `agents` table implements the endpoint's roster port; endpoint-only
  columns (`color`, `position`, `role`) ride along. The first open seeds the
  candidate catalog: `claude-agent-acp`, `codex-acp` (package dependencies),
  and `opencode acp` (the person's own install). The agents page runs the
  kit's probe on every row and shows 缺失, 待登录, 可入座, or 已入座.
- Member leases live in the kit's own SQLite store (see `/lease` above);
  migration 0008 dropped the old `member_leases` table from the rooms
  library. A second room-web process against the same library is still not
  supported.
- Room settings: `wake` (`broadcast` default, or `addressed`), `serial` (off by
  default), `depth_ceiling` (default `2n`), `round_budget` (default `n(n+1)`),
  and `cwd` (default `~/.rivus/room-web/v1/work/<roomId>`), where `n` is the
  member count when the round opened.
- Dispatcher: an admitted human message and every member post dispatch with
  the same semantics (wake rule, `addressed` filter, round budget, `serial`
  order). A `pass` wakes nobody. When the round budget is spent the dispatcher
  posts one notice and stops waking for that round; the person's next message
  opens a new round.
- Turn input: at most 50 events and 48k characters after the member's cursor,
  as four prompt blocks: the agent's system prompt, room facts (who you are,
  seat order, what woke you), the inbox one line per event, and the
  instruction to call `room_speak` once or end the turn silently.
- Permission policy: each turn's Harness carries `cwdPermissionPolicy(cwd)`
  (`room-service.server.ts`). It reads the paths the agent's raw tool input
  names (absolute strings only, resolved through symlinks) and picks a reject
  option when a write-kind call names one outside the room's `cwd`, or names
  none at all; a judged-inside request gets an allow option. Anything the
  policy cannot judge is left undefined, which the kit answers as a denial.
  An `execute` call that reports no path is therefore allowed, so a shell
  command can still write outside `cwd`; the policy only sees the paths the
  input carries.
- Room tools: `room_speak({ body, addressedTo? })` returns `posted`, `held`
  with the newer events, or `turn-closed`, `already-spoke`, `held-limit`;
  `room_read({ afterSeq?, limit? })`; `room_dm({ to, body })` finds or opens
  the private room between the caller and `to` under the current room. One post
  per turn; `room_dm` does not count as the post.
- Private rooms: a child room seats the caller and one peer and links to its
  parent and the triggering event. The person can open, read, and speak in any
  private room; it nests under its parent in the sidebar. Its events wake only
  its members and count against the parent round's budget. Nothing flows back
  to the parent automatically; the conclusion stays in the private room.
- `turns` logs every turn (`round_seq`, `trigger_seq`, `read_up_to_seq`,
  outcome `posted`/`passed`/`timeout`/`failed`, `held_count`, error). Member
  status is derived, never stored: 在场 (no lease), 阅读中 / 工作中 (lease
  held, before and after a tool call update), then the last outcome. HELD is
  not shown to the person.
- The room page has no push channel: while a request is pending or a member
  is 阅读中 or 工作中, it revalidates its loader every 900 ms
  (`presentation/room-lab.tsx`).
- Room mutations (`routes/room.$roomId.tsx`) require `Content-Type:
  application/json` and an `Origin` of `http://127.0.0.1` or
  `http://localhost` (`assertSameOriginJson`). The form actions for creating a
  room (`routes/room._index.tsx`) and managing agents (`routes/room.agents.tsx`)
  use `assertSameOriginForm`: no content-type check, and a request without an
  `Origin` header is allowed because browsers omit it on some same-origin form
  posts; a present `Origin` must be local. Every route also refuses to run
  outside a local runtime (`assertLocalRuntime`).
- Every person-facing string goes through `app/room-lab/copy.ts` and its
  grammar test.
- `passed`, `timeout`, and `failed` must stay distinct in the UI: silence and
  failure look alike from outside, and each has its own status label
  (`presentation/agent-status.ts`). The driver reports `stopReason: null` both
  when the turn timeout ends a turn and when a prompt dies another way; the
  `timedOut` flag on the turn result separates them. A null stop reason with an
  error and no `timedOut` is recorded as `failed`, not `timeout`
  (`room-service.server.ts`).
- Room tools travel as one streamable-HTTP MCP endpoint per (room, member)
  session, hosted on the loopback address behind the session's token by the
  endpoint's `ToolServer` (`application/tool-server.server.ts`). ACP carries
  `mcpServers` only on `session/new`, so the first activation hosts the
  endpoint and every later one re-serves its tools on it; a call is answered
  only while that member has an open turn.

A session lost to a restart is loaded from its binding on the next
activation (see `/acp` above), so the member keeps its conversation and
reads the events it missed; only what the agent kept outside the room
record is lost.

### Task board

`/board` and `/task/:id` read real Tasks through the
`@rivus/agent-task-loop/task-management` export (`buildTaskProvider`,
`loadConfig`, `TaskRecord`), read-only. The board groups the ten statuses into
five lanes (`app/board/domain/lanes.ts`):

| Lane     | Statuses               |
| -------- | ---------------------- |
| 待办     | 待处理                 |
| 进行中   | 进行中, 执行中, 修复中 |
| 审核中   | 待复核                 |
| 待你决定 | 待决策, 待发布, 待验收 |
| 已结束   | 已完成, 已失败         |

A model review PASS stays in 待你决定 until a person acts; the task detail
page says so. Board and rooms are not linked to each other, and the board
cannot write. Task agents (`TARGET_AGENTS` in agent-task-loop) and the
room-web `agents` table are separate lists. Board actions, one agent roster
and Room-to-Task links are tracked in
[#157](https://github.com/PerfectPan/agent-task-loop/issues/157).

## Measured behavior

Measured on 2026-09-28 and 2026-09-29 with `claude-agent-acp` 0.81.0 and
`codex-acp` 1.13.0 (the opencode backend had no credit):

- Cost is dominated by each member's first activation in a room (about
  22–27k tokens of context), not by the wake mode.
- `serial` turns wall time from the longest turn into the sum of turns without
  reducing activations or tokens, so it stays off by default.
- HELD fires where members run concurrently and resolves inside the turn.
- A silent pass can be expensive when the member does tool work in `cwd`
  before deciding to pass; the tuning point is the member's system prompt.
