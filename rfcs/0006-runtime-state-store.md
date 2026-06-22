# RFC 0006: Provider-unaware Run-time State Store

## Status

Proposed (revised after adversarial review — see *Review notes* at the end)

## Summary

The agent loop's **run-time execution state** — session ids, runner pid/heartbeat,
workspace path, review/acceptance rounds, publish result, claim info — is today
persisted only by writing it into the task source. Feishu Base happens to have
columns for all of it, so the loop got persistence "for free"; a source that
cannot represent those fields (GitHub Issues) silently loses them
(`updateRunnerState` is a no-op, `mapIssue` never re-populates session fields).
That makes capabilities like `resume`, `watch`, and the TUI session preview
**degraded on GitHub-only configs**.

This RFC makes run-time state a first-class, **source-agnostic** concern owned by
the loop, persisted in a local store that **the providers never see**. A thin
decorator (`StatefulTaskProvider`) wraps the existing provider tree and:

- on writes, records the run-time field subset to a local `TaskStateStore` keyed
  by the stable backend record id, then delegates to the inner provider unchanged;
- on reads, overlays the stored fields onto each `TaskRecord` — **the local store
  is authoritative for the run-time subset, the backend is the fallback** when no
  local entry exists.

Feishu keeps writing exactly what it writes today (still authoritative for the
task system-of-record, still visible in the Base); GitHub — and any future
low-fidelity source — gains the same run-time capabilities from the local mirror.

## Motivation

### Root cause: the task source was doubling as the state store

Two distinct responsibilities were conflated onto one backend:

1. **Task system-of-record** — title, status, project, priority, owner. Rightly
   owned by each source's backend.
2. **Loop run-time state** — session ids, runner info, heartbeat, workspace path,
   round counters, publish result, claim info. This is the **loop's** state.

Concern (2) was never owned by the loop — it lived in the Feishu schema. So when
the backend can't express it, the capability vanishes. This is a coupling defect,
not a GitHub limitation: run-time state must survive regardless of source.

### Evidence (current `main`, includes #61)

- `github-issues-task-provider.ts`: `updateRunnerState` / `updateTaskAssignment` /
  `updateCleanupState` are no-ops; `claimTask` / `updateTaskProgress` post issue
  *comments*; `mapIssue` populates none of the run-time fields (it does set
  `prLink` from the issue URL and `status` from open/closed).
- `resume.ts` / `watch.ts` read these fields straight off the `TaskRecord` —
  `undefined` for GitHub tasks.
- `workspace-service.ts` only `mkdir`s; there is **no** local state backend today.

## Goals

- Run-time state survives for **every** source, so `resume` / `watch` / TUI
  session preview work identically.
- **Providers stay unaware** of the store: no provider gains capability-detection
  or persistence logic; the store is a cross-cutting decorator.
- **Feishu writes are preserved unchanged** — Feishu remains the authoritative
  system-of-record for its tasks and still shows fields in the Base.
- Local persistence is **best-effort**: never blocks or fails a source write, and
  is robust to concurrent processes (atomic writes).
- `cleanup` removes a task's local state; stale state is bounded.

## Non-Goals

- Cross-machine recovery of GitHub run-time state. Agent session transcripts are
  themselves machine-local (claude/codex write them under `~`), so the local
  store sharing that locality is consistent — not a regression.
- Changing the `SourceProvider` / `TaskProvider` interfaces.
- A general cache for the *task definition* (title/status/priority). Only the
  run-time subset is mirrored.
- Preserving manual edits to run-time fields made directly in the Feishu Base UI.
  Run-time fields are loop-owned; the loop's writes are authoritative for them.

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

### Keying — by `recordId`, not `taskId`

The store key is **`(source, recordId)`**. `recordId` is the stable backend id
(GitHub issue number; Feishu record id) and never changes for a task's lifetime.
`taskId` is **not** stable on GitHub: `mapIssue` derives it as the
`<!-- task-id -->` marker value *or* `GH-<number>` as a fallback, so editing or
losing the marker would re-key and orphan the local state.

`createTask` has no `recordId` yet and writes no run-time fields, so it is **not
mirrored** — mirroring begins at `claimTask`, whose `TaskRef` carries `recordId`.
Every other write method also receives a `TaskRef` (which includes `recordId`),
so all of them can key the store.

### The run-time field subset

`RUNTIME_KEYS` is the exact set of `TaskRecord` fields the loop writes during
execution and that `resume` / `watch` / the TUI read back. It deliberately
**excludes** task-definition fields (`taskId`, `title`, `project`, `priority`,
`targetAgent`, `status`) which stay backend-owned.

```ts
export const RUNTIME_KEYS = [
  // sessions
  'sessionId', 'sessionName', 'sessionHistory',
  'executionSessionId', 'executionSessionName',
  'reviewSessionId', 'reviewSessionName',
  // runner / workspace
  'runnerPid', 'runnerKind', 'runnerAgent', 'runnerRound',
  'lastHeartbeatAt', 'workspacePath', 'logPath', 'reviewLogPath',
  // progress / claim / ownership
  'progressSummary', 'claimedBy', 'claimedAt', 'runId', 'currentOwner',
  // review / acceptance rounds + verdicts
  'reviewRound', 'reviewVerdict', 'reviewFindings',
  'acceptanceRound', 'acceptanceVerdict', 'acceptanceFeedback',
  // result / publish
  'resultSummary', 'lastError', 'prLink',
  'publishBranch', 'publishCommit', 'publishedAt',
] as const;

export type RuntimeTaskState = Partial<Pick<TaskRecord, typeof RUNTIME_KEYS[number]>>;
```

(The exact list is finalized in the plan by auditing every `*Payload` type plus
`resume.ts` / `watch.ts` / the TUI detail fields, so nothing a backend can't hold
is left unmirrored.)

### `TaskStateStore`

```ts
export interface TaskStateStore {
  read(source: string, recordId: string): RuntimeTaskState | undefined;
  /** Merge a patch; keys present in the patch overwrite, INCLUDING cleared
   *  values ('' / null / 0) so a backend-side clear is recorded, not dropped. */
  merge(source: string, recordId: string, patch: RuntimeTaskState): void;
  clear(source: string, recordId: string): void;
}
```

**`FileTaskStateStore`** persists one JSON file per task at
`~/.agent-task-loop/state/<sanitized-source>/<recordId>.json` (source ids like
`github:owner/repo` → `github_owner_repo`). Robustness:

- **Atomic writes**: write a temp file then `rename` (atomic on the same
  filesystem) so a concurrent reader never sees a torn JSON.
- **Best-effort**: every read/write is wrapped; a failure logs and degrades to
  "no local state", never throws into the loop or a source write.
- **In-memory cache**: entries are cached per process and invalidated on write,
  so `listTasks` polling does not hit disk once per record per tick.
- **Bounded**: `clear` on cleanup removes the file; a TTL sweep (configurable,
  default e.g. 30 days by file mtime) prunes orphans from tasks that ended
  out-of-band, so the directory does not grow without limit.

### `StatefulTaskProvider`

Wraps an inner `TaskProvider` and a `TaskStateStore`.

- **Writes** (`claimTask`, `updateTaskProgress`, `updateRunnerState`,
  `updateTaskAssignment`, `updateReviewState`, `markTaskSucceeded`,
  `markTaskFailed`, `updatePublishResult`, `updateCleanupState`): project the
  payload onto `RUNTIME_KEYS`, `store.merge(task.source, task.recordId, subset)`
  (best-effort, **recording cleared values too**), then `await inner.<method>(...)`
  unchanged. `createTask` delegates only. `updateCleanupState` also `store.clear`s.
- **Reads** (`listTasks`, `listPendingTasks`, `getTaskById`): call the inner
  provider, then overlay with **local-authoritative-for-the-subset, backend
  fallback** precedence:

  ```ts
  function overlay(record: TaskRecord, stored?: RuntimeTaskState): TaskRecord {
    if (!stored) return record;            // no local entry → backend as-is
    const merged = { ...record };
    for (const key of RUNTIME_KEYS) {
      if (key in stored) merged[key] = stored[key]; // local wins, incl. cleared
    }
    return merged;
  }
  ```

  Key-presence (`key in stored`) — not an `undefined` check — is what
  distinguishes "the loop cleared this field" (stored as `''`/`null`) from "the
  loop never wrote it" (absent). This kills the stale-resurrection bug: after
  `cleanup`, the file is removed entirely, so reads fall straight through to the
  backend.

Why local-authoritative (not backend-wins): the run-time subset is written *only*
by the loop, and the local store holds the loop's most-recent truth including
clears. For a Feishu task this matches the Base (the loop dual-wrote both); when
the local entry is absent (e.g. resuming a Feishu task on another machine) it
falls back to the Base column. GitHub has no column, so local is the sole home.

### Composition

```ts
const inner = /* feishu / github / composite, as today */;
return new StatefulTaskProvider(inner, new FileTaskStateStore());
```

Providers and the composite are untouched; the wrapper is transparent (same
`TaskProvider` interface). It reads `task.source` + `task.recordId` off the
`TaskRef`/record it is handed, so it never needs to know the composite's routing.

## Behavior Matrix

| Source | Backend write | Local mirror | Read precedence | `resume`/`watch` |
| --- | --- | --- | --- | --- |
| feishu | full columns (unchanged) | shadow (written; read only as fallback) | local entry, else backend | works (as today) |
| github | comments + open/closed; run-time no-op | **authoritative** for run-time | local entry, else backend | **now works** |
| both | per owning backend | per task's owning backend | local entry, else backend | works for both |

## Compatibility

- Feishu-only / Feishu+GitHub: no change to what is written to the Base. Reads are
  identical *except* that, within a single machine, a loop-cleared run-time field
  is reflected immediately from local state (which also matches the Base, since
  the loop dual-wrote the clear). Manual Base edits to run-time fields are not
  preserved (documented Non-Goal).
- GitHub-only: strict capability gain; run-time fields now populate.
- New on-disk artifact under `~/.agent-task-loop/state/`. No migration; absence ⇒
  fall back to backend. `cleanup` clears per task; TTL prunes orphans.

## Testing

- **FileTaskStateStore**: merge→read round-trips the subset incl. cleared values
  (`key in` semantics); atomic write survives a concurrent read (no torn parse);
  a write error is swallowed; cache invalidates on write; TTL prune removes old
  files; `clear` deletes.
- **StatefulTaskProvider writes**: each method projects the right subset, keys by
  `recordId`, records clears, and still delegates to the inner provider (spy
  inner); a throwing store doesn't break the delegate; `createTask` is not
  mirrored; `updateCleanupState` clears.
- **StatefulTaskProvider reads**: github record (no run-time fields) + stored state
  ⇒ overlaid; a stored *cleared* field ⇒ stays cleared (no resurrection); no local
  entry ⇒ backend value passes through; feishu record with fields + matching local
  ⇒ consistent.
- **buildTaskProvider**: returns a `StatefulTaskProvider`; #61 routing/sources
  unaffected.
- **resume/watch (integration)**: a github task with prior local state prints a
  `claude --resume <id>` line and the publish/result fields.

## Alternatives Considered

- **Backend-wins, fill-only-undefined (original draft).** Rejected: cannot tell a
  backend that *cleared* a field from one that *never stores* it, resurrecting
  stale state after cleanup. The local-authoritative + key-presence model fixes
  this without per-provider capability knowledge.
- **Key by `taskId`.** Rejected: unstable on GitHub (marker edits re-key).
- **Persist state into the issue body (`<!-- atl-state: {…} -->`).** Gives
  cross-machine recovery but PATCHes the body every transition and leaks internal
  state into the issue. Possible future opt-in.
- **Per-command direct state-service calls.** Spreads persistence across call
  sites and makes them aware of it; the decorator centralizes it.
- **Drop run-time columns from Feishu.** The user wants Feishu writes kept
  (visible in the Base); rejected.

## Rollout

Stacked on #61 (now merged to `main`); this RFC and its implementation PR stack on
top. Implementation lands behind this RFC's approval.

## Review notes (incorporated)

An adversarial review of the first draft raised four blockers, all addressed
above: (1) field set was incomplete vs `resume`/`watch` → `RUNTIME_KEYS` audited
and expanded; (2) "backend-wins/fill-undefined" resurrected cleared state →
switched to local-authoritative with key-presence semantics + clear-on-cleanup;
(3) `taskId` is an unstable key on GitHub → key by `recordId`; (4) `createTask`
has no `recordId`/run-time fields → not mirrored, mirroring starts at `claimTask`.
Plus robustness fixes: atomic temp+rename writes, an in-memory cache for poll
reads, and a TTL sweep to bound orphaned state.
