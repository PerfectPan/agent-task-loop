# Task Sources and Run-time State

`@rivus/agent-task-loop` is an integration layer, not a system of record. Each
Task is owned by one Task Backend (Feishu Base or GitHub Issues); the loop
reads it from there and routes writes back to the owner. The loop's own
execution state lives in a local store the backends never see.

Configuration and commands are in [`../configuration.md`](../configuration.md).

## Provider composition

`buildTaskProvider` (`packages/agent-task-loop/src/task-management/build-task-provider.ts`)
builds one leaf provider per configured source:

| Config | Leaf providers | Default write target |
| --- | --- | --- |
| `feishu` only | `FeishuTaskProvider` | Feishu |
| `githubIssues` only | one `GitHubIssuesTaskProvider` per repository, source id `github:<owner>/<repo>` | the first repository |
| both | all of the above | Feishu |
| neither | rejected by the config schema and by `assertRuntimeConfig` | — |

One leaf is used directly; several are wrapped in `CompositeTaskProvider`,
which reads every source and routes each write to the record's `source`. In
the default `best-effort` read mode a failing source is skipped with a warning
instead of failing the whole read; `strict` mode fails the read.

The whole tree is wrapped in `StatefulTaskProvider` (below). Providers do not
know about that wrapper.

### GitHub Issues specifics

- The token comes from `githubIssues.token`, then `GITHUB_TOKEN`, then
  `gh auth token` (memoized per process, never written to config).
- An issue is a Task only if it carries the hidden `<!-- task-id: ... -->`
  marker (issues created by this tool) or an `agent:<name>` label for a
  supported agent (`claude`, `codex`, `coco`, `glm`). Other issues are
  ignored.
- An issue is only open or closed, so intermediate statuses are kept in the
  local run-time store.

### Feishu specifics

`schema` checks and, with `--apply`, creates the Base fields the loop needs.
With no Feishu source configured, `schema` prints a notice and exits 0.

## Run-time state store

The loop writes execution state (session ids and history, runner pid and
heartbeat, workspace and log paths, claim and ownership, review and acceptance
rounds and verdicts, result and publish fields, and the lifecycle `status`) on
every source. A backend that cannot hold those fields (GitHub Issues) would
otherwise lose them, breaking `resume`, `watch`, `complete`, and the TUI.

- `RUNTIME_KEYS` (`task-management/runtime-state.ts`) is the exact field set.
  Task-definition fields (`taskId`, `title`, `project`, `priority`,
  `targetAgent`, `source`, `recordId`, `description`, `repository`,
  timestamps) stay backend-owned.
- `FileTaskStateStore` (`task-management/task-state-store.ts`) keeps one JSON
  file per task under `~/.agent-task-loop/state/<source>/<recordId>.json`.
  Path segments are sanitized and suffixed with a short hash so distinct ids
  never collide.
- The key is `(source, recordId)`, never `taskId`: a GitHub `taskId` can
  change when the marker is edited, the issue number cannot. `createTask` has
  no `recordId` yet and is not mirrored; mirroring starts at `claimTask`.
- Writes are atomic (temp file plus `rename`). Every filesystem access is
  best-effort: a failure degrades to "no local state" and never fails the
  source write.
- Reads use an mtime-aware in-process cache, so TUI polling does not re-parse
  unchanged files but still sees another process's writes.
- `StatefulTaskProvider` records the run-time subset of every write, including
  cleared values, then delegates the write unchanged. On read it overlays
  stored keys onto the backend record: for a key present in the store the local
  value wins, including a cleared value; a key absent from the store falls back
  to the backend. Key presence, not `undefined`, decides.
- `updateCleanupState` does not delete the task's file. It merges a cleared
  value for each transient run-time field (workspace and log paths, runner
  pid/kind/agent/round, heartbeat, last error, review and acceptance verdicts
  and feedback) and keeps the lifecycle `status`, result summary, PR link,
  publish info, and session ids and history (`CLEANUP_CLEARED_STATE` in
  `stateful-task-provider.ts`). Cleanup must never revert a finished task: on a
  binary backend such as GitHub, dropping the stored `status` would make a
  done task read as 待处理 again. `TaskStateStore.clear()` exists but nothing
  in `src/` calls it; files leave the store only through the 180-day prune in
  `buildTaskProvider`.

Limits:

- The store is machine-local. Resuming a GitHub task on another machine has no
  run-time state; agent transcripts are machine-local too.
- For any run-time key the store holds, the local value shadows the Feishu
  Base on read (`overlayRuntimeState` in `runtime-state.ts`): a manual edit of
  such a column in the Base is not visible to the loop, and the loop's next
  write for that field overwrites it.
- The file store has no cross-process lock beyond atomic replace. Exclusive
  task runs rely on the task lease below.

## Task run lease

`start` occupies the key `task:<taskId>` before claiming the Task
(`task-manager/task-occupancy-service.ts`, `orchestration/task-orchestration.ts`).
Two concurrent starts race for the lease: one wins, the other never claims the
backend record. Every Task lifecycle write in an occupied run runs inside the
lease fence: a stale holder cannot begin a write, and a successor waits for an
already-started predecessor write before writing newer state.

The run baton (`Run`, the `classic-delivery` template with seats `impl` and
`review`, and the process runner) belongs to `agent-task-loop`
(`src/orchestration/`). Only the lease itself comes from
`@rivus/agent-orchestration`'s `LeaseManager` with a file lease store, shared by
the CLI and TUI processes.
