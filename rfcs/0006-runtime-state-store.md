# RFC 0006: Provider-unaware Run-time State Store

## Status

Proposed

## Summary

The agent loop's **run-time execution state** — session ids, runner pid/heartbeat,
workspace path, review round, claim info — is today persisted only by writing it
into the task source. Feishu Base happens to have columns for all of it, so the
loop got persistence "for free"; a source that cannot represent those fields
(GitHub Issues) silently loses them (`updateRunnerState` is a no-op, `mapIssue`
never re-populates session fields). That makes capabilities like `resume`,
`watch`, and the TUI session preview **degraded on GitHub-only configs**.

This RFC makes run-time state a first-class, **source-agnostic** concern owned by
the loop, persisted in a local store that **the providers never see**. A thin
decorator (`StatefulTaskProvider`) wraps the existing provider tree and:

- on writes, records the run-time field subset to a local `TaskStateStore`, then
  delegates to the inner provider unchanged;
- on reads, overlays the stored fields onto each `TaskRecord`, **backend value
  wins, local fills only what the backend left empty**.

Feishu keeps writing exactly what it writes today (still authoritative, still
visible in the Base); GitHub — and any future low-fidelity source — gains the
same run-time capabilities from the local mirror.

## Motivation

### Root cause: the task source was doubling as the state store

Two distinct responsibilities were conflated onto one backend:

1. **Task system-of-record** — title, status, owner. Rightly owned by each
   source's backend.
2. **Loop run-time state** — `executionSessionId`/`Name`, `reviewSessionId`/`Name`,
   `sessionHistory`, `runnerPid`/`runnerKind`/`runnerAgent`/`runnerRound`,
   `lastHeartbeatAt`, `workspacePath`, `logPath`, `reviewRound`, `claimedBy`,
   `runId`. This is the **loop's** state, not the task source's.

Concern (2) was never owned by the loop — it lived in the Feishu schema. So when
the backend can't express it, the capability vanishes. This is a coupling defect,
not a GitHub limitation: architecturally, run-time state must survive regardless
of which source backs a task.

### Evidence (current `main` + #61)

- `github-issues-task-provider.ts`: `updateRunnerState` / `updateTaskAssignment` /
  `updateCleanupState` are no-ops; `claimTask` / `updateTaskProgress` post issue
  *comments* (append-only, not machine-re-readable); `mapIssue` populates none of
  the run-time fields.
- `resume.ts` reads `task.executionSessionId` / `reviewSessionId` straight from the
  task record — `undefined` for GitHub tasks.
- `workspace-service.ts` only `mkdir`s; there is **no** local state backend today
  (the "the loop owns these in its own backend" comment is currently inaccurate).

## Goals

- Run-time state survives for **every** source (feishu, github, future), so
  `resume` / `watch` / TUI session preview work identically.
- **Providers stay unaware** of the store: no provider gains capability-detection
  or persistence logic; the store is a cross-cutting decorator.
- **Feishu writes are preserved unchanged** — Feishu remains the authoritative
  system-of-record for its tasks and still shows run-time fields in the Base.
- Local persistence is **best-effort**: it never blocks or fails a source write.
- `cleanup` removes a task's local state.

## Non-Goals

- Cross-machine recovery of GitHub run-time state. Agent session transcripts are
  themselves machine-local (claude/codex write them under `~`), so the local
  store sharing that locality is consistent — not a regression.
- Changing the `SourceProvider` / `TaskProvider` interfaces.
- A general task cache / offline mode for the *task definition* (title/status).
  Only the run-time field subset is mirrored.
- Syncing or reconciling divergence between local and backend (backend always
  wins on read; see below).

## Proposed Design

### Components

```
TaskProvider (interface, unchanged)
  ├─ FeishuTaskProvider          ┐ unaware of the store; unchanged
  ├─ GitHubIssuesTaskProvider    ┘
  └─ CompositeTaskProvider

NEW StatefulTaskProvider implements TaskProvider   // outermost wrapper
NEW TaskStateStore (interface) + FileTaskStateStore (impl)
```

### `TaskStateStore`

```ts
/** The loop-owned run-time subset mirrored per task. All optional. */
export interface RuntimeTaskState {
  workspacePath?: string;
  logPath?: string;
  progressSummary?: string;
  executionSessionId?: string;
  executionSessionName?: string;
  reviewSessionId?: string;
  reviewSessionName?: string;
  sessionHistory?: string;
  runnerPid?: number;
  runnerKind?: string;
  runnerAgent?: string;
  runnerRound?: number;
  lastHeartbeatAt?: string;
  reviewRound?: number;
  claimedBy?: string;
  runId?: string;
}

export interface TaskStateStore {
  read(source: string, taskId: string): RuntimeTaskState | undefined;
  /** Shallow-merge a patch into the stored state (defined keys overwrite). */
  merge(source: string, taskId: string, patch: RuntimeTaskState): void;
  clear(source: string, taskId: string): void;
}
```

**`FileTaskStateStore`** persists one JSON file per task at
`~/.agent-task-loop/state/<sanitized-source>/<sanitized-taskId>.json`. Source ids
like `github:owner/repo` are sanitized (`/`, `:` → `_`). Reads/writes are
synchronous JSON; all wrapped in try/catch so a store failure degrades to "no
local state" and is logged, never thrown (best-effort).

### `StatefulTaskProvider`

Wraps an inner `TaskProvider` and a `TaskStateStore`.

- **Writes** (`claimTask`, `updateTaskProgress`, `updateRunnerState`,
  `updateTaskAssignment`, `updateReviewState`, `markTaskSucceeded`,
  `markTaskFailed`, `updatePublishResult`, `updateCleanupState`): extract the
  `RuntimeTaskState` subset from the payload, `store.merge(task.source, task.taskId, subset)`
  (best-effort), then `await inner.<method>(...)` unchanged. `createTask` delegates
  only (nothing to mirror yet). `updateCleanupState` also calls `store.clear`.
- **Reads** (`listTasks`, `listPendingTasks`, `getTaskById`): call the inner
  provider, then for each record overlay the stored state with
  **backend-wins** precedence:

  ```ts
  function overlay(record: TaskRecord, stored?: RuntimeTaskState): TaskRecord {
    if (!stored) return record;
    const merged = { ...record };
    for (const key of RUNTIME_KEYS) {
      if (merged[key] === undefined && stored[key] !== undefined) {
        merged[key] = stored[key];
      }
    }
    return merged;
  }
  ```

  → Feishu records already carry the fields, so overlay is a no-op for them
  (zero behavior change). GitHub records carry none, so the store fills them.

### Composition

`buildTaskProvider` wraps the final provider:

```ts
const inner = /* feishu / github / composite, as today */;
return new StatefulTaskProvider(inner, new FileTaskStateStore());
```

Providers and the composite are untouched. The wrapper is transparent: it
implements the same `TaskProvider` interface, so every command/service keeps
calling exactly what it calls today.

### Why dual-write (even for Feishu)

Skipping the local write when the backend can persist a field would require the
wrapper to know each provider's column capabilities — re-introducing
provider-awareness, the very thing we're removing. Instead the wrapper always
mirrors; the cost is one cheap local JSON write per transition. The Feishu mirror
is a harmless shadow (never read, since backend wins) that also yields a fast,
offline-capable local read path and a uniform audit trail.

## Behavior Matrix

| Source | Backend write | Local mirror | Read precedence | `resume`/`watch` |
| --- | --- | --- | --- | --- |
| feishu | full columns (unchanged) | shadow (written, not read) | backend | works (as today) |
| github | comments + open/closed; run-time no-op | **authoritative** for run-time | local fills gaps | **now works** |
| both | per owning backend | shadow for feishu tasks, primary for github tasks | backend, else local | works for both |

## Compatibility

- Feishu-only and Feishu+GitHub configs: **no behavioral change** (overlay is a
  no-op when the backend supplies the field).
- GitHub-only configs: a strict capability gain; previously-`undefined` run-time
  fields are now populated from the local store.
- New on-disk artifact under `~/.agent-task-loop/state/`. No migration needed;
  absence ⇒ empty state. `cleanup` clears per-task files.

## Testing

- **FileTaskStateStore**: merge then read round-trips the subset; unknown
  source/taskId → `undefined`; source ids with `/`/`:` are sanitized to a single
  file; a write error is swallowed (best-effort) and surfaces as no state.
- **StatefulTaskProvider (writes)**: each write method mirrors the right subset
  to the store and still delegates to the inner provider (spy inner); a throwing
  store does not break the delegate; `updateCleanupState` clears.
- **StatefulTaskProvider (reads)**: github record (no run-time fields) + stored
  state ⇒ overlaid; feishu record with fields present ⇒ backend wins (overlay
  no-op); no stored state ⇒ record unchanged.
- **buildTaskProvider**: returns a `StatefulTaskProvider`; routing/sources still
  behave as in #61 (composite unaffected).
- **resume (integration)**: a github task with prior local state prints a
  `claude --resume <id>` line.

## Alternatives Considered

- **Persist run-time state into the issue body (`<!-- atl-state: {…} -->`).**
  Gives cross-machine recovery and keeps the issue self-describing, but PATCHes
  the body on every transition and leaks internal state into the issue. Rejected
  as default; could be a future opt-in for teams that want issue-portable state.
- **Per-command direct calls to a state service.** Spreads persistence across
  every command and makes call sites aware of it. The decorator centralizes it
  and keeps callers/providers unchanged.
- **Drop run-time columns from Feishu, make local the only home.** The user wants
  Feishu writes kept (visible in the Base); rejected.

## Rollout

Stacked on #61 (`feat/github-only-task-source-impl`) since the wrapper composes
in `buildTaskProvider`, which #61 reshaped. Merge **bottom-up**: #61 first, then
this RFC, then the implementation PR. Implementation lands behind this RFC's
approval.
