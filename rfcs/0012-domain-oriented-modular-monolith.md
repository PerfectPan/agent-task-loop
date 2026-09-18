# RFC 0012: Domain-oriented modular monolith

## Status

Proposed

## Decision

This repository is a modular monolith. Code ownership follows bounded contexts
and domain language. Technical layers live inside those boundaries; they do not
define the repository's primary structure.

A workspace package represents a bounded context or a public delivery surface.
One package may contain several aggregates when they share the same language
and transaction model. A folder named `domain` is not enough: business state
changes must run through an aggregate root or a named domain service.

## Domain map

### Agent Orchestration

`@rivus/agent-orchestration` owns one occupied run.

- `Run` is the aggregate root.
- `Seat` is an entity inside `Run`; callers cannot persist or change a seat on
  its own.
- Facts, mail entries, command bindings (`cmd` and `args`), and the allowed seat
  are part of Run state. Environment variables are ephemeral execution input;
  they never enter a persisted Run snapshot or an observed view.
- Occupancy freshness is a domain policy over a lease record.
- `Orchestration` is an application service. It loads a Run, invokes domain
  behavior, persists the resulting snapshot, and coordinates process IO.
- File locks, clocks, pid checks, schedulers, and process runners are adapters.

Run occupancy remains separate from Room write serialization. Neither model
may import the other.

### Agent Room

`@rivus/agent-room` owns a posted conversation stream and each agent runtime's
position in that stream.

- `Room` is an aggregate root. It owns ordered events, sequence assignment,
  external transport-message idempotency, and bounded reads. Internal posts use
  their sequence as identity and do not enter the transport deduplication index;
  the existing `messageId` field remains a compatibility/display attribute.
- `RoomEvent` is an entity identified inside a Room by sequence.
- `AgentSession` is a separate aggregate root identified by tenant, agent,
  room, and runtime generation. It owns `seenSeq` and the one-shot hold.
- `replyInSerial` is a domain service because the HELD decision reads and
  changes both aggregates in one write transaction.
- `shouldWake` is a stateless domain service. Seeing an event does not imply a
  wake decision.
- Memory and future SQLite stores implement persistence and serialization; they
  do not decide HELD, cursor advancement, idempotency, or wake policy.

### Task Delivery

`@rivus/agent-task-loop` coordinates external task sources and delivery. A
GitHub or Feishu task record is not an aggregate owned by this repository. The
application layer may project those records, but it must not hide delivery
rules in provider adapters.

The current task-loop code predates this RFC. It will move by capability when a
feature changes it. The first candidate is task execution: start eligibility,
run ownership, review state, and terminal delivery belong together. This RFC
does not authorize a directory-only rewrite of untouched services.

## Required structure

Use the smallest layout that makes ownership plain.

For a package with one bounded context:

```text
src/
  domain/          aggregate roots, entities, value objects, domain services
  application/     commands, queries, use cases, consumer-owned ports
  infrastructure/  repository and external-system adapters
```

For a package with several aggregates or subdomains:

```text
src/
  room/
    domain/
    application/
    infrastructure/
  agent-session/
    domain/
  wake/
    domain/
```

Do not add an `entities/` or `services/` bucket unless the names inside it still
make sense without reading their imports. Prefer `room.ts`,
`agent-session.ts`, and `reply-in-serial.ts` over generic base classes.

## Dependency rules

1. Domain code imports no application or infrastructure module.
2. Domain code does not read files, inspect processes, call networks, or obtain
   the current time. Applications pass those values in.
3. Application services call aggregate behavior instead of editing snapshots.
4. Infrastructure implements ports owned by the consuming domain or
   application layer. It may translate protocols, but it cannot invent domain
   outcomes.
5. An aggregate keeps its invariants inside one commit boundary. Cross-aggregate
   behavior needs a named domain service plus a transaction boundary.
6. DTOs and persisted snapshots are representations, not aggregate roots.
7. Imports between bounded contexts go through their public package surface.
8. Circular context dependencies are forbidden.

## Implementation in this stack

The RFC 0010 implementation stack applies these rules now:

- `Run` owns orchestration state changes.
- `Room` owns stream ordering, external-admit idempotency, and slice reads.
- `AgentSessionAggregate` owns cursor and hold state.
- `replyInSerial` owns the HELD rule across Room and AgentSession.
- `shouldWake` remains a domain service under the wake subdomain.
- Memory stores keep data and transaction order; they call the domain model for
  decisions.

The public APIs remain compatible with the earlier stack layers. Callers still
use `createOrchestration()` and `createMemoryRoomStreamStore()`.

## Review gate

Every migration PR needs an architecture review before it becomes ready for
merge. The reviewer checks:

- the bounded context owns the language and state it introduces;
- aggregate roots guard state changes and expose no mutable internals;
- entities have identity inside an aggregate;
- domain services exist only for rules that do not fit one entity or aggregate;
- application code coordinates work without duplicating domain rules;
- adapters contain protocol and persistence details only;
- tests exercise aggregate invariants without requiring an adapter.

Review findings block the PR until the author fixes them and the reviewer checks
the new diff. Passing CI alone does not satisfy this gate.

## Rejected approaches

### One global Domain/Application/Infrastructure tree

This keeps dependency direction visible but scatters one capability across the
repository. Ownership becomes harder to see as the codebase grows.

### One aggregate per file or package

File count is not a domain model. Closely related entities may stay together
when the aggregate and test boundary remain clear.

### Big-bang migration

Moving unchanged code produces a large diff without proving better ownership.
Migrate a context when its behavior changes, add invariant tests, and keep old
public contracts stable until callers move.
