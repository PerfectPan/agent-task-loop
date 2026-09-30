# Architecture Overview

This repository is a domain-oriented modular monolith. Code ownership follows
bounded contexts and their language; technical layers live inside those
boundaries and do not define the repository's primary structure. A workspace
package is a bounded context or a public delivery surface.

## Packages

| Package                                                       | Question it answers                                                                       | Published                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `@rivus/agent-task-loop` (`packages/agent-task-loop`)         | Where is this task in its delivery pipeline                                               | npm                                                    |
| `@rivus/agent-finder-core` (`packages/agent-finder`)          | Which coding agents are installed on this host                                            | npm, plus the MoonBit module `PerfectPan/agent-finder` |
| `@rivus/agent-finder-cli` (`packages/agent-finder-cli`)       | Discovery and session browsing from a terminal                                            | npm                                                    |
| `@rivus/agent-sessions` (`packages/agent-sessions`)           | Which agent sessions exist on disk and what they said                                     | internal, bundled                                      |
| `@rivus/agent-room` (`packages/agent-room`)                   | What was said in a room, who has read up to where, who should look next                   | internal                                               |
| `@rivus/agent-orchestration` (`packages/agent-orchestration`) | Which agents exist, whether each can be reached, who may run now, how a turn is delivered | internal                                               |
| `@rivus/rslib-config` (`packages/rslib-config`)               | Shared build configuration                                                                | internal                                               |
| `@rivus/room-web` (`apps/room-web`)                           | The local collaboration endpoint: everything with a product name                          | internal app                                           |
| `@rivus/web` (`apps/web`)                                     | The landing site                                                                          | internal app                                           |

Detailed pages:

- [Task sources and run-time state](task-sources.md)
- [Agent discovery and the MoonBit build](agent-finder.md)
- [Agent sessions](agent-sessions.md)
- [Agent collaboration: rooms, control plane, room-web](agent-collaboration.md)
- The Rivus Task Manager Plugin: [`packages/agent-task-loop/docs/rivus-plugin.md`](../../packages/agent-task-loop/docs/rivus-plugin.md)

## Dependency rules

1. Domain code imports no application or infrastructure module.
2. Domain code does not read files, inspect processes, call networks, or read
   the current time. Applications pass those values in.
3. Application services call aggregate behavior instead of editing snapshots.
4. Infrastructure implements ports owned by the consuming domain or
   application layer. It translates protocols; it does not invent domain
   outcomes.
5. An aggregate keeps its invariants inside one commit boundary.
   Cross-aggregate behavior needs a named domain service and a transaction
   boundary.
6. DTOs and persisted snapshots are representations, not aggregate roots.
7. Imports between bounded contexts go through their public package surface.
8. Circular context dependencies are forbidden.

Package-level rules, enforced by boundary tests:

- `agent-room` and `agent-orchestration` do not import each other
  (`packages/agent-orchestration/tests/package-boundary.test.ts`,
  `packages/agent-room/tests/package-boundary.test.ts`).
- `agent-task-loop` may import the lease from `agent-orchestration`. It does
  not import `agent-room`, and its Rivus Plugin neither reads nor writes Room
  state (`packages/agent-task-loop/tests/room-isolation.test.ts`).
- `apps/room-web` is the only place that knows all three.
- `agent-finder-cli` uses only `@rivus/agent-finder-core`'s public API and does
  not call MoonBit directly; the core package does not depend on CLI framework
  packages (`packages/agent-finder/tests/package-boundary.test.ts`).

## Layout inside a package

Use the smallest layout that makes ownership plain. One bounded context:

```text
src/
  domain/          aggregate roots, entities, value objects, domain services
  application/     commands, queries, use cases, consumer-owned ports
  infrastructure/  repository and external-system adapters
```

Several aggregates or subdomains get one folder each, with the same three
layers inside as needed (for example `agent-room`'s `room/`,
`agent-session/`, and `wake/`). Do not add `entities/` or `services/` buckets
whose names only make sense after reading their imports.

Older task-loop code predates these rules. It moves by capability when a
feature changes it; directory-only rewrites of untouched services are not
done. `src/task-delivery/` is the first capability moved this way.

## Two mechanisms that must not be mixed

| Mechanism                                 | Owns                                                                                     | Must not be used for    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------- |
| Lease on `task:<taskId>` (task run baton) | Exclusive task run: one `start` wins, lifecycle writes run fenced under the holder token | Room order, chat turns  |
| Lease on `room:<roomId>:member:<agentId>` | One activation per room member at a time                                                 | Task start exclusion    |
| Room record `seq`                         | Events already posted in a room                                                          | Task status, worker pid |
| Room HELD                                 | A stale `speak` at the write point                                                       | Task start exclusion    |
| Rivus Plugin tools                        | The Task Backend through the Task Manager                                                | Room membership or seq  |

If two callers race a task start, the task lease decides. If two members race
a post, HELD decides. Neither is implemented with the other.

## Architecture review

Every change that introduces or moves a bounded context, aggregate, or port
gets an architecture review before merge. The reviewer checks that the context
owns the language and state it introduces, aggregate roots guard their state
changes, entities have identity inside an aggregate, domain services exist
only for rules that fit no single aggregate, application code coordinates
without duplicating domain rules, adapters hold only protocol and persistence
details, and tests exercise aggregate invariants without an adapter. Passing
CI alone does not satisfy this review.
