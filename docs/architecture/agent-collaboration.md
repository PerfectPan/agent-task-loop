# Agent Collaboration

A Room works like a group chat for people. Every member sees every message
and decides alone whether to act. A member that acts works in private and then
says one thing through the Room, or says nothing. Nothing schedules turns; the
record is the only shared context. The runtime guarantees one thing: a member
runs one session at a time.

Three pieces implement this: `@rivus/agent-room` (the protocol),
`@rivus/agent-orchestration` (the control plane), and `apps/room-web` (the
endpoint). How to run room-web is in
[`apps/room-web/README.md`](../../apps/room-web/README.md).

## Principles and the rules they fix

| Principle | Rule |
| --- | --- |
| Rooms are the only channel | No shared workspace, draft, blackboard, or mail. A member that wants others to know something posts it; a private exchange is a room with fewer members |
| Members are peers | The write point is the same for a person's message and an agent's; only the caller differs |
| Seeing is not speaking | A wake produces a turn; a turn ends in `speak` or `pass`; both advance the member's cursor |
| Work is private, results are public | An agent speaks only by calling a Room tool. Printed text is never posted; there is no stdout fallback. Progress is not a message |
| A member is single-threaded | One Inbox and one lease per (room, member). A wake for a busy member collapses into one pending flag |
| Order is derived, not scheduled | `shouldWake` is a broadcast. The room's `serial` switch runs the woken set one at a time in seat order without changing the protocol |
| Attention is bounded | Every event carries a wake depth; a depth ceiling and a per-round turn budget bound the work |
| Mechanism below, policy above | The packages know nothing about count-offs, roles, tasks, or products; those live in the endpoint |

## `@rivus/agent-room`: the protocol

Stores nothing; exposes ports and a memory implementation.

- `RoomEvent`: `seq` (identity inside a room), `author` (`human`, `agent`,
  `control-plane`), `kind` (`human`, `posted`, `control-plane`), `body`,
  `addressedTo`, `wakeDepth` (0 for a human message, trigger + 1 for a post),
  optional `transportMessageId`.
- `AgentSession` keeps `seenSeq` per (room, member).

| Write point | Caller | Effect |
| --- | --- | --- |
| `admit(event)` | endpoint, for a human message | Append at depth 0; idempotent on `transportMessageId` |
| `speak({ body, addressedTo, readUpToSeq, triggerSeq })` | a member's turn | HELD, with the newer events, if any event by another author has `seq > readUpToSeq`; otherwise append `posted` at trigger depth + 1 and move the cursor |
| `pass({ readUpToSeq })` | a turn ending without a post | Move the cursor; never HELD |
| `speak` with `origin: 'control-plane'` | endpoint, for a notice such as the round budget | Append a control-plane event, which wakes nobody |

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

## `@rivus/agent-orchestration`: the control plane

Its noun is the Agent; it never hears about rooms and owns no database.

- `Agent` (`id`, which is also the word after `@`; `label`; `binding` =
  command, args, env; `systemPrompt`; optional `timeoutMs`) and the
  `AgentRegistry` port.
- `AgentConnector.probe(binding)` answers `missing` (the process did not
  start), `needs-login` (`initialize` worked, `session/new` refused), or `ready`
  with capabilities. Discovery for rooms is this handshake, not a filesystem
  scan.
- `LeaseStore` and `LeaseManager`: a lease is fresh while the holder pid is
  alive and the heartbeat is within `staleAfterMs`. `runFenced` runs a write
  only while the caller still holds the lease, so a turn that lost its lease
  across a long `prompt` never lands its result. Room keys are
  `room:<roomId>:member:<agentId>`.
- `Harness`: the per-turn injection slots (`cwd`, `systemPrompt`, input blocks,
  MCP tools, permission policy, hooks, workspace files). The control plane owns
  the slots and plumbing; the endpoint fills them. A Harness is assembled per
  turn and never stored.
- `AcpConnector` (`./acp` entry) on `@agentclientprotocol/sdk`, with profiles
  for `claude-agent-acp`, `codex-acp`, and `opencode acp`. The claude profile
  passes the system prompt through `_meta.systemPrompt`; agents without such a
  channel get it as the first block. The connector has no permission policy
  of its own: without a `permissionHandler` it answers every permission
  request `cancelled` (`acp-connector.ts`). The client file system it
  advertises (`fs/read_text_file`, `fs/write_text_file`) resolves every path
  against the session's `cwd` and refuses anything outside it, symlinks
  included.
- `ToolServer` hosts the endpoint's tool definitions as one streamable-HTTP
  MCP endpoint on `127.0.0.1` per (room, agent) session, created at the first
  `session/new` (ACP carries `mcpServers` only there) and re-served on every
  later activation. A call is answered only while that member has an
  activation running. Adapters without `mcpCapabilities.http` use the stdio
  shim `bin/acp-tool-shim.js`.
- `AgentRuntime`: one Inbox per key, at most one activation at a time, wakes
  while running collapse into one pending flag. An activation acquires the
  lease, connects or reuses the process, reuses or creates the long-lived ACP
  session, asks the endpoint for the Harness, prompts, runs `afterTurn`, and
  only then releases the lease, so the fenced pass lands inside the held
  window. The default turn timeout is 10 minutes; an agent row may override
  it.

## `apps/room-web`: the endpoint

Local-only React Router app bound to `127.0.0.1`. One database,
`~/.rivus/room-web/v1/rooms.sqlite` (`RIVUS_ROOM_HOME` overrides the
directory), with a forward-only migration chain in
`app/room-lab/infrastructure/migrations/`.

- The `agents` table implements `AgentRegistry`; endpoint-only columns
  (`color`, `position`, `role`) ride along. The first open seeds the candidate
  catalog: `claude-agent-acp`, `codex-acp` (package dependencies), and
  `opencode acp` (the person's own install). The agents page runs `probe` on
  every row and shows 缺失, 待登录, 可入座, or 已入座.
- `member_leases` implements `LeaseStore` for one process: `runFenced` is a
  per-key promise chain plus a re-read of the holder. A second room-web process
  against the same library is not supported.
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
  (`room-service.server.ts`). It picks a reject option when the tool call
  reports a location outside the room's `cwd` (paths resolved through
  symlinks; relative or unresolvable paths count as outside), or when an
  `edit`, `delete`, or `move` call reports no location at all. Every other
  request gets an allow option. An `execute` call that reports no locations
  is therefore allowed, so a shell command can still write outside `cwd`; the
  policy only sees the locations the adapter reports.
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
  (`presentation/agent-status.ts`). The runtime reports `stopReason: null` both
  when its watchdog ends a turn and when a prompt dies another way; the
  `timedOut` flag on the turn result separates them. A null stop reason with an
  error and no `timedOut` is recorded as `failed`, not `timeout`
  (`room-service.server.ts`).

A turn is never replayed on restart. A session lost to a restart is recreated
on the next activation, which carries the member's unread events; only the
member's private memory is lost.

### Task board

`/board` and `/task/:id` read real Tasks through the
`@rivus/agent-task-loop/task-management` export (`buildTaskProvider`,
`loadConfig`, `TaskRecord`), read-only. The board groups the ten statuses into
five lanes (`app/board/domain/lanes.ts`):

| Lane | Statuses |
| --- | --- |
| 待办 | 待处理 |
| 进行中 | 进行中, 执行中, 修复中 |
| 审核中 | 待复核 |
| 待你决定 | 待决策, 待发布, 待验收 |
| 已结束 | 已完成, 已失败 |

A model review PASS stays in 待你决定 until a person acts; the task detail
page says so. Board and rooms are not linked to each other, and the board
cannot write. The remaining board and room-to-task work is in
[`specs/0014-task-board-actions.md`](../../specs/0014-task-board-actions.md).

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
