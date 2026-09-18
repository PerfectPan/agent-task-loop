# @rivus/room-web — local Room flight deck

A local-only Remix application for proving the Agent Room and Task Delivery
domains with the locally authenticated Codex and Claude CLIs.

## Run

```bash
pnpm --filter @rivus/room-web dev
```

Open <http://127.0.0.1:3210/room>.

- **Room chat** wakes both CLIs from the same `seenSeq`. The first completed
  draft is posted; a stale second draft is `HELD` until it rereads the newer
  public events.
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
