# @rivus/room-web — composable local agent workspace

A local-only React Router 7 (framework mode) application for composing authenticated coding agents into
one shared Room. A Room may use any non-empty subset of the registered agents,
in any order.

## Agents

An agent is a row in the `agents` table of `~/.rivus/room-web/v1/rooms.sqlite`.
The code knows no agent by name: it reads the id, the display label, the role
word, the shell command to run, and an identity colour drawn at random when the
row is created. The first time this app opens a library it seeds rows for the
four commands it ships with — `claude`, `codex`, `opencode`, `dsh` — plus one
row for every agent id an older library already seats.

Until the agents page can add one, add an agent with `sqlite3`:

```sql
INSERT INTO agents (id, label, role, command, color, position, created_at)
VALUES (
  'gemini',                              -- also the word after @, ^[a-z][a-z0-9-]*$
  'Gemini',                              -- display name
  '调研',                                 -- role word, free text
  'gemini --prompt-interactive false',   -- run as: zsh -lic '<command> "$1"'
  2,                                     -- 1..5, maps to --chart-1..5
  4,                                     -- default seating order
  '2026-09-18T00:00:00.000Z'
);
```

Then press 重新扫描 on the agents page, which re-reads the table and re-probes
each command. A member's availability is one `whence -w` lookup in the same
interactive login shell the runner uses, so an alias or a shell function counts
as installed exactly when it will actually run; the alias body is never read.

## Run

```bash
pnpm --filter @rivus/room-web dev
```

Open <http://127.0.0.1:3210/room>.

- **Manage members / 管理成员** adds, removes, and reorders registered agents. The selected
  order is a domain invariant, not presentation-only state.
- **Room chat** broadcasts unmentioned messages to the active composition.
  `@agent` targets an active seat, while `@all` explicitly addresses the current
  Room. A mention to a known but inactive agent is rejected instead of silently
  broadcasting.
  Concurrent drafts still pass through the same `seenSeq` and `HELD` write
  point before they become public facts.
- **Check connection / 检查连接** calls only the active agents, in the configured
  order. Every number is a real agent reply committed to the same monotonic
  Room stream, so the UI can show the exact sequence that each seat observed
  and extended.
- **Task gate** invokes the Task Delivery application: Codex occupies `impl`,
  Claude occupies `review`, and rejected work returns through one rework round.
  The gate remains unavailable unless both required seats are active.
  Task state is persisted before it is projected into Room, so a Room failure
  cannot change the Task verdict.
  A model PASS is shown as awaiting human acceptance, never as human approval.
- State is memory-only and resets with the server. Set
  `ROOM_AGENT_TIMEOUT_MS` to change the default 120-second CLI timeout.

Both development and production scripts bind to `127.0.0.1`; the production
route is disabled unless it was started by the package's local-only script.
Mutations also require a same-origin JSON request. This process starts locally
authenticated CLI tools and must not be exposed through a proxy or public
deployment.

## Interface

The Room uses the yellow Studio direction: a persistent crew sidebar, illustrated
portraits and an open conversation stream. Task and run details stay secondary to
chat. Narrow screens move member management into the header.

Enter sends, Shift+Enter inserts a line break, and Enter or Tab selects an open
mention suggestion. IME composition does not submit. Escape closes dialogs and
returns focus to their trigger. Drafts survive failed actions and polling updates.

Component tests use the separate `vitest.config.ts`; React Router's browser Fast
Refresh pipeline is not loaded into jsdom. Run `pnpm --filter @rivus/room-web test` and
`pnpm --filter @rivus/room-web typecheck` to check this app.
