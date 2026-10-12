---
---

Room-web drives its agents over `@rivus/agent-kit` 0.11.0 and schedules its turns with `@rivus/agent-kit-collab` 0.11.0. The private `@rivus/agent-orchestration` control-plane package — already application-only since the orchestration code moved into the endpoint — is deleted together with its tests. It was `"private": true`, so there is no npm action: no release, no deprecation flag, no dependents.

What replaced what, inside `apps/room-web`:

- `AcpConnector` is replaced by the kit's `/acp` entry (`connectAgent`, `probeAgent`, `builtinAcpProfiles`, `agentEnv`, `optionOfKind`) plus the endpoint's own mapping from an `agents` row to a profile (`infrastructure/agent-acp.server.ts`). Agents start with exactly the environment the profile picks — nothing is inherited wholesale as before — and the connection, not the endpoint, bounds the cancel at 5 s: a turn that ignores `session/cancel` gets its session binding removed and its connection closed.
- Sessions are bound per `room:<roomId>:member:<agentId>` key through `FileSessionBindingStoreLive` (next to the rooms library), so a session survives a server restart via `session/load` instead of being recreated with a fresh conversation.
- The handwritten wake-coalescing `AgentRuntime` is replaced by `createLanes` (`/lanes`; `maxConcurrent` 16, `maxQueued` 64, `turnTimeoutMs` 600 s). The lease, connection and prompt lifecycle live in the caller's `activate`; the host assembly root owns one `ManagedRuntime`, and wake/cancel run their Effects in callbacks with failures observed.
- The member lease runs on the kit's `/lease` (`createLeaseManager` over `sqliteLeaseRepository`, own `member-leases.sqlite` next to the rooms library), with the old timing: heartbeat 15 s, stale after 120 s. `member_leases` in the rooms database is dropped by migration 0008.
- `ToolServer` and the room-specific orchestration move into the endpoint (`application/tool-server.server.ts`, `application/turn.ts`), unchanged except that the unused stdio-shim transport is gone (room-web only ever used the HTTP transport).

Accepted corrections from the old/new comparison (behavior differences, deliberately kept):

- The permission policy reads the agent's `rawInput` paths instead of the adapter-reported `locations` the old `ToolCallUpdate` carried (the kit's `PermissionRequest` has no `locations`). Relative paths are no longer treated as outside-`cwd` locations; they are simply not judged, and a write-kind call naming only relative paths is denied for naming no judged location.
- The system prompt now travels once per session (in `_meta.systemPrompt` for the claude profile, as the first prompt block otherwise) instead of being re-sent on every turn of a reused session.
- The turn timeout and lease heartbeat move from a per-turn watchdog plus a heartbeat timer in the runtime to the kit's lane timeout and the lease manager's own renewal fiber; the observable bounds are the same (10-minute default turn, 15 s/120 s lease timing).
