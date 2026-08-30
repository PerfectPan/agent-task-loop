# @rivus/room-web — local Room flight deck

A local-only Remix application for proving the Agent Room and Task Delivery
domains with five locally authenticated CLI seats: Claude Relay, Claude, Codex,
OpenCode, and DSH.

## Run

```bash
pnpm --filter @rivus/room-web dev
```

Open <http://127.0.0.1:3210/room>.

- **Room chat** broadcasts unmentioned messages to all five CLIs. `@agent`
  targets one or more seats, while `@all` explicitly addresses the full roster.
  Concurrent drafts still pass through the same `seenSeq` and `HELD` write
  point before they become public facts.
- **Five-seat count-off** calls the roster in a fixed order. Every number is a
  real agent reply committed to the same monotonic Room stream, so the UI can
  show the exact sequence that each seat observed and extended.
- **Task gate** invokes the Task Delivery application: Codex occupies `impl`,
  Claude occupies `review`, and rejected work returns through one rework round.
  Task state is persisted before it is projected into Room, so a Room failure
  cannot change the Task verdict.
- State is memory-only and resets with the server. Set
  `ROOM_AGENT_TIMEOUT_MS` to change the default 120-second CLI timeout.

Both development and production scripts bind to `127.0.0.1`; the production
route is disabled unless it was started by the package's local-only script.
Mutations also require a same-origin JSON request. This process starts locally
authenticated CLI tools and must not be exposed through a proxy or public
deployment.
