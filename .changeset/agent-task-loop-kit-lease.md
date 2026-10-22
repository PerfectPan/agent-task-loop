---
'@rivus/agent-task-loop': minor
---

Occupy Tasks with `@rivus/agent-kit-collab` 0.20.0's `/lease` (`createLeaseManager` + a scoped `manager.acquire`) instead of `@rivus/agent-orchestration`'s `LeaseManager` and `FileLeaseStore`. `effect@4.0.4` is an exact dependency. The old orchestration facade (`src/orchestration/orchestration.ts`, `node-factory.ts`, `task-orchestration.ts`) is deleted; the run baton (`Run`, the `classic-delivery` template, the run-state stores, the seat policy) stays application-side and the seat lifecycle is wired to the kit lease handle. The occupancy key stays `task:<taskId>`.

Differences accepted in the old/new comparison, recorded in the lease tests:

- The lease heartbeat is the kit's managed fiber (15 s renewals, 120 s TTL, each renewal a compare-and-swap); the old per-mutation lease CAS and per-spawn heartbeat timer are gone, and run-state writes check the observed loss instead.
- The lease record is the kit's schema (`<key>.lease.json` with a schema version and a tombstone on release). Old `lease.lock` files are not migrated; an existing holder keeps running and a later run re-acquires, which continues the fencing generation.
- A lease lost mid-run now surfaces as `TaskLeaseLostError` (taken over, released, missing or expired) instead of the old `OrchestrationConflictError` from the heartbeat; a refused fenced write still reports the orchestration conflict. A second start of the same Task keeps the old message: `Task <id> already has an active orchestration (pid <pid>)`.
- An unreadable or newer-schema lease record is refused without being overwritten (repository failure) where the old store treated it as absent and conflicted.
