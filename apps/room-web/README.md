# @rivus/room-web — composable local agent workspace

A local-only React Router 8 (framework mode) application for composing authenticated coding agents into
one shared Room. A Room may use any non-empty subset of the registered agents,
in any order.

## Agents

An agent is a row in the `agents` table of `~/.rivus/room-web/v1/rooms.sqlite`.
The code knows no agent by name: it reads the id, the display label, the role
word, the shell command to run, an identity colour drawn at random when the row
is created, and the system prompt prepended to every turn that member takes.
The room's own prompt carries facts only — who you are, how many of you there
are, what has been said — so how a member answers is its row's business, and
the agents page edits it.

The first time this app opens a library it seeds rows for the three ACP
candidates in its catalog — `claude-agent-acp`, `codex-acp` (both shipped as
this package's dependencies) and `opencode acp` (the person's own install) —
plus one row for every agent id an older library already seats.

Add another agent with the form at the bottom of the agents page: an id that
is also the word after `@` (`^[a-z][a-z0-9-]*$`), a display label, the ACP
command line run through the person's login shell, and a role word. Then press
重新扫描, which re-reads the table and runs `probe` on every row — `initialize`
plus a trial `session/new`, so the answer is whether the adapter starts, whether
it is logged in, and whether it can open a session. A row shows one of four
states: 缺失, 待登录, 可入座, 已入座.

## Run

```bash
pnpm --filter @rivus/room-web dev
```

Open <http://127.0.0.1:3210/room>.

- **Manage members / 管理成员** adds, removes, and reorders registered agents. The selected
  order is a domain invariant, not presentation-only state, and sets turn order when `serial` is enabled.
- **Room chat** wakes members according to room settings (`wake`: `broadcast` by default or `addressed`;
  `serial`: off by default; `cwd`: defaults to `~/.rivus/room-web/v1/work/<roomId>`). `@agent` targets
  an active seat and `@all` addresses all seated members; a mention to a known but inactive agent is
  rejected instead of silently broadcasting. Members post through Room MCP tools (`room_speak`,
  `room_read`, `room_dm`), and concurrent turns go through the same `seenSeq` and `HELD` write point
  before becoming public facts.
- **Private rooms (`room_dm`)** open a child room between two members under the parent room; the person
  can read and speak in any child room from the sidebar.
- Rooms, their seating, the transcript, and each member's cursor live in
  `~/.rivus/room-web/v1/rooms.sqlite` and survive a restart (member leases live beside it in
  `member-leases.sqlite`). Set `RIVUS_ROOM_HOME` to store the library elsewhere. Turn timeout defaults
  to 10 minutes and can be shortened per agent via the `agents` table's `timeout_ms` column.

Both development and production scripts bind to `127.0.0.1`; the production
route is disabled unless it was started by the package's local-only script.
Room mutations also require a JSON request from a local origin; the room
creation and agent forms check only a present `Origin` (see
[agent collaboration](../../docs/architecture/agent-collaboration.md)). This process starts locally
authenticated CLI tools and must not be exposed through a proxy or public
deployment.

## Interface

The Room is chat first, in three columns: a rail of rooms, the conversation, and
the members panel. Each member wears a round mark built from its id and the colour
on its row, so a new member needs no artwork. Below 1180px the members column
becomes a drawer; below 640px the rail becomes a top strip. `/board` and
`/task/:id` provide a read-only task board over `@rivus/agent-task-loop/task-management`
and are not linked from the room.

Enter sends, Shift+Enter inserts a line break, and Enter or Tab selects an open
mention suggestion. IME composition does not submit. Escape closes dialogs and
returns focus to their trigger. Drafts survive failed actions and polling updates.

Component tests share this `vite.config.ts`; the React Router plugin is gated on
`!process.env.VITEST`, keeping its browser Fast Refresh pipeline out of jsdom. Run
`pnpm --filter @rivus/room-web test` and `pnpm --filter @rivus/room-web typecheck` to
check this app.
