# @rivus/room-web — composable local agent workspace

A local-only Remix application for composing authenticated coding agents into
one shared Room. The catalog currently includes Claude Relay, Claude, Codex,
OpenCode, and DSH; a Room may use any non-empty subset in any order.

## Run

```bash
pnpm --filter @rivus/room-web dev
```

Open <http://127.0.0.1:3210/room>.

- **Compose the Room** adds, removes, and reorders supported agents. The selected
  order is a domain invariant, not presentation-only state.
- **Room chat** broadcasts unmentioned messages to the active composition.
  `@agent` targets an active seat, while `@all` explicitly addresses the current
  Room. A mention to a known but inactive agent is rejected instead of silently
  broadcasting.
  Concurrent drafts still pass through the same `seenSeq` and `HELD` write
  point before they become public facts.
- **Composable count-off** calls only the active agents, in the configured
  order. Every number is a real agent reply committed to the same monotonic
  Room stream, so the UI can show the exact sequence that each seat observed
  and extended.
- **Task gate** invokes the Task Delivery application: Codex occupies `impl`,
  Claude occupies `review`, and rejected work returns through one rework round.
  The gate remains unavailable unless both required seats are active.
  Task state is persisted before it is projected into Room, so a Room failure
  cannot change the Task verdict.
- State is memory-only and resets with the server. Set
  `ROOM_AGENT_TIMEOUT_MS` to change the default 120-second CLI timeout.

Both development and production scripts bind to `127.0.0.1`; the production
route is disabled unless it was started by the package's local-only script.
Mutations also require a same-origin JSON request. This process starts locally
authenticated CLI tools and must not be exposed through a proxy or public
deployment.
