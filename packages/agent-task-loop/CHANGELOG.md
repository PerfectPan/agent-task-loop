# @rivus/agent-task-loop

## 0.10.0

### Minor Changes

- af94276: Add an external Rivus Task Manager Plugin with a least-authority Agent Profile,
  four bounded task Tools, redacted public DTOs, shared task-start orchestration,
  and a clean-consumer package verification gate.

### Patch Changes

- 0fe70cc: Add an `agent-task-loop create` command for scriptable task creation, with required flags, interactive prompting in TTYs, source selection, validation, and JSON output.
- de36605: Fix `complete`/auto-publish failing outright with "paths are ignored by one of your .gitignore files" once a target repo's own `.gitignore` covers `.agent-task-loop/` (as this repo's now does, per the prior fix in #83). `GitPublishService.commitAll` used a pathspec exclusion (`-- . ':!.agent-task-loop'`), which git treats as an error when the excluded path is _already_ gitignored. Switched to `git add -A` followed by `git reset -- .agent-task-loop`, which is a no-op whether the path was ignored, untracked, or absent — and still keeps the directory out of the commit either way.
- 68e39c6: Fix `complete`/auto-publish committing agent-task-loop's own `.agent-task-loop/` runtime bookkeeping directory (session logs) into the task's commit. `GitPublishService.commitAll` used `git add -A`, which only skips a path when the _target_ repo's own `.gitignore` covers it — since agent-task-loop runs against arbitrary repos, a repo without that rule got its run logs (which embed local absolute paths) committed and pushed. `commitAll` now excludes `.agent-task-loop/` via an explicit pathspec regardless of the target repo's `.gitignore`.

## 0.9.0

### Minor Changes

- 933d3ad: Fix a batch of GitHub-only correctness, robustness and UX issues found by a full audit:

  - **prLink no longer = the issue URL.** `mapIssue` used to stamp the issue's `html_url` into `prLink`, which (a) showed the issue link in the TUI "PR" field and (b) made `DeliveryCheckService` treat every GitHub task as already-published, skipping the real working-tree/new-commit check. The real PR link now comes only from the run-time store.
  - **GitHub setup is no longer a trap.** `source add` / `init` now scaffold the matching `projects[<repo>]` / `repositories[<owner>/<repo>]` entries (keyed exactly as the run path expects), the shipped `config.example.json` is correctly keyed, and `assertRuntimeConfig` fails fast with an actionable error when a GitHub source has no matching project/repository or a `localPath`/`workspaceRoot` is unset — instead of a cryptic per-task "unknown project" mid-run.
  - **Cleanup keeps the task's outcome.** `updateCleanupState` now clears only transient run-time fields and preserves `status`, `prLink`, publish info and session history — so a finished GitHub task keeps showing its PR + transcript and never resurrects to 待处理 (an earlier fix over-cleared and wiped them).
  - **Agent reassignment persists on GitHub.** `updateTaskAssignment` now rewrites the issue's `agent:<name>` label (was a no-op, so the new agent never saw the task).
  - **`complete` is more robust:** refuses to publish when the workspace is on the default branch (parity with auto-publish), and a missing PR-description process-summary is now a warning rather than a hard failure that left a dangling open PR with the task stuck pre-已完成.
  - **Clearer push failures:** a non-fast-forward push is reported with actionable guidance instead of a raw git error.
  - **TUI:** the session/transcript index refreshes on a stale miss (sessions created after startup are now found instead of "Transcript not found"), and scrollable panes add slack so long transcripts/detail can always be scrolled to the bottom.
  - **Hygiene:** the run-time state store now prunes orphaned entries (180-day TTL), and `listTasks` warns instead of silently truncating when a repo exceeds the 1000-issue page cap.

  Known design limits (not changed): intermediate statuses are machine-local (cross-machine reads fall back to the issue's open/closed), and terminal mouse/drag selection of wrapped URLs is a terminal-takeover limitation.

## 0.8.0

### Minor Changes

- 672626d: Close the GitHub-Issues task source to full parity with Feishu so the loop runs end-to-end (publish → execute → review → complete → cleanup, plus reject/watch/resume) on a GitHub-only setup.

  GitHub issues are binary (open/closed ⇒ 待处理 / 已完成), so every intermediate lifecycle status (执行中 / 待复核 / 待发布 / 待验收 / 修复中 / 已失败) is owned by the loop and persisted in the run-time state store, then overlaid on reads:

  - `status` is mirrored in the local store: `updateReviewState` carries it; `StatefulTaskProvider` injects the implied 执行中 on claim, 待验收 on succeed (matching Feishu, not 已完成), and 已失败 on fail. So `complete` (gates on 待验收/待发布), `reject`, `cleanup`, `watch` and `start` recovery read the correct status across separate commands.
  - **`listPendingTasks` now filters on the overlaid status**, not the backend's raw open/closed. Previously an in-flight or finished GitHub task (issue still open) was re-offered as pending and could be re-claimed.
  - **`updateCleanupState` preserves the lifecycle `status`** while dropping transient run-time fields, so a finished task never resurrects to 待处理 after cleanup (Feishu keeps Status across cleanup; we mirror that).
  - **The GitHub issue closes on the terminal 已完成 transition** (via `updateReviewState`), so the binary backend itself records completion even if the run-time store is later cleared. `markTaskSucceeded` (待验收) no longer closes the issue.
  - `listTasks` paginates (`state=all`, 100/page, up to 1000) for read parity with Feishu's full list.

  Adds unit coverage for each behaviour plus two end-to-end tests over the real provider stack (`StatefulTaskProvider` + file-backed store + an in-memory fake GitHub API): a full execute→review→publish→complete→cleanup walk asserting status parity and no resurrection, and the real `CompleteService` publishing a 待发布 GitHub task and closing its issue. Cross-machine remains a non-goal. Feishu is unaffected.

## 0.7.1

### Patch Changes

- 2f85be4: CompositeTaskProvider reads are now fault-tolerant: a source that fails to read (e.g. a Feishu Base whose lark-cli auth is missing the `base:record:read` scope) is **skipped with a warning** instead of failing the whole read. Previously `listTasks`/`listPendingTasks` used `Promise.all`, so one unhealthy source blanked the entire board (the TUI showed "No tasks" and hid healthy GitHub tasks); `getTaskById` likewise threw if an earlier source errored. Now healthy sources always come through and the failing source is reported on stderr.

## 0.7.0

### Minor Changes

- f49477c: Add a `source` command to manage task sources without hand-editing the config (RFC 0007). `agent-task-loop source list` shows configured sources and the default; `source add --type github|feishu …` merges a source into the existing config (a second GitHub repo appends to `repositories[]`); `source remove <id>` drops one (keeping ≥1). Flags drive non-interactive use; a TTY prompts for missing values and prefills owner/repo from `gh repo view`. `init` now points at `source add` when a config already exists.

## 0.6.0

### Minor Changes

- 3254593: GitHub-Issues-only task source + JSON config (RFC 0005). `feishu` is now optional — configure at least one of `feishu` / `githubIssues`. Config is JSON-only and resolved from `--config` → `AGENT_TASK_LOOP_CONFIG` → `~/.agent-task-loop/config.json` (no more per-directory `task.config.*` discovery or `.ts`/`.js` config). The GitHub token falls back to `gh auth token`. `init` lets you pick the source(s); the TUI can publish a task as a linked GitHub issue and refine the description with AI (`Ctrl+R`, requires a `claude` agent).

  `githubIssues` also supports **multiple repositories** via a `repositories[]` array — each becomes its own `github:<owner>/<repo>` task source (selectable in the TUI). To avoid adopting every issue in a repo, only issues that opt in are treated as tasks: those carrying the `<!-- task-id -->` marker (created through this tool) or an `agent:<name>` label (hand-off).

  The TUI shows a compact per-row source tag (repo short name) and adds a `s` source-filter popup (multi-select, with a `src:` header chip) for focusing on specific repos; the `/` text filter now also matches source/repository.

  Closes #24.

- 8a18edc: Provider-unaware run-time state store (RFC 0006). The loop's run-time state — session ids, runner pid/heartbeat, workspace path, review/acceptance rounds, publish result, claim info — is now persisted in a local store (`~/.agent-task-loop/state/<source>/<recordId>.json`) by a `StatefulTaskProvider` decorator that wraps the provider tree. Writes mirror the run-time subset locally then delegate unchanged; reads overlay it (local authoritative for the subset, backend as fallback). Feishu writes are untouched (still authoritative, still in the Base); GitHub — and any future low-fidelity source — keeps `resume`/`watch`/TUI session preview working instead of losing run-time state. The providers never see the store. Writes are atomic and best-effort; `cleanup` clears per-task state.

## 0.5.3

### Patch Changes

- 480e372: Internal refactor: the TUI's session discovery and transcript parsing now delegate to the shared `@rivus/agent-sessions` core (bundled into the published package), replacing the package-local copy. Preview output is unchanged — the transcript is mapped back through `toLines()` and the existing TUI tests are green.

## 0.5.2

### Patch Changes

- a81cd65: Fix latent type errors surfaced by the new CI typecheck gate:

  - `watch`: return `0` (not `undefined`) for `nextOffset` when a log read fails, so the next poll resumes from a valid offset.
  - `workspace`: narrow `existingWorkspacePath` before returning it.
  - `schema`: type the field-detail list as `ExistingField[]` so `id`/`options` lookups are sound.
  - `review-loop`: include `acceptanceFeedback` in the reviewer dependency's input type.

## 0.5.1

### Patch Changes

- Updated dependencies [c7a99de]
  - @rivus/agent-finder-core@0.1.2

## 0.5.0

### Minor Changes

- 2c8078b: feat(task): integration-layer multi-source task backends

  Position the tool as an integration layer over your existing trackers rather
  than a system of record. Each task's source of truth stays its own backend;
  the CLI and TUI read from many and route writes back to the owning source.

  - Every `TaskRecord`/`TaskRef` carries a `source`; a `SourceProvider` interface
    declares each leaf backend's id. Feishu Base reports `source: 'feishu'`.
  - `CompositeTaskProvider` reads/merges from all configured sources and routes
    writes (and creates) back to the backend that owns each task, with a default
    source for unrouted creates. No global store, no cross-source sync.
  - New `GitHubIssuesTaskProvider`: read + create tasks backed by GitHub Issues
    (task-id marker, `agent:`/`P{n}` labels, PRs skipped), with lifecycle changes
    synced back as issue comments / close. Enabled via an optional `githubIssues`
    config block (`owner`/`repo`/`token`/`defaultAgent`).
  - TUI multi-source affordances: a per-row source tag and a `来源` detail field
    for secondary backends, plus a capability-aware Source selector in the create
    form (shown only when more than one create-capable source is configured).

- 2c8078b: feat(tui): interactive task + agent-session dashboard

  Rebuild the `tui` command into a full-screen three-pane dashboard (task list ·
  detail · live session preview) on a layered, fully-tested architecture:

  - Pure, React-free logic (sort/filter/viewport/format/truncate/layout/heartbeat/
    session-history parsing) with exhaustive unit tests.
  - Provider-agnostic data layer (`SessionProvider` + fs-backed implementation)
    and an injected clock, so the whole UI is deterministic under test.
  - Performance: manual list windowing, memoized rows, and signature-gated
    polling to avoid re-render/flicker.
  - CJK-aware truncation, semantic status colors, focus-aware borders, a help
    overlay, and live filtering.
  - Runs full-screen on the alternate screen buffer by default.
  - Create tasks without leaving the dashboard (`n`), with required-field
    validation; the footer shows an `[n] new` hint when creation is available.
  - An in-app workflow diagram overlay (`w`) drawn as one connected diagram with
    the rework loop arc.
  - Per-round transcript drill-in: each agent round resolves its own session and
    renders a chat-style transcript, with markers for which rounds are viewable
    on this machine.

## 0.4.0

### Minor Changes

- b13bd1b: Add `--json` flag to `sync`, `schema`, `cleanup`, and `complete` commands for machine-readable output.

## 0.3.0

### Minor Changes

- 4efb151: Add `--json` flag to `sync`, `schema`, `cleanup`, and `complete` commands for machine-readable output.

## 0.2.0

### Minor Changes

- d06ddb2: Add global config fallback and `init` command.

  - `task.config.json` is now a supported project config format alongside TypeScript/JavaScript configs.
  - Config resolution falls back to `~/.agent-task-loop/config.json` when no project config is found.
  - New `init` command detects `lark-cli` (and offers to install it), discovers available coding agents via `@rivus/agent-finder-core`, prompts for Feishu credentials, and writes the global config.
  - "No config found" error now mentions `agent-task-loop init`.

## 0.1.1

### Patch Changes

- 4272fb1: Replace tsup with rslib for all packages. Eliminate scripts/sync-moonbit-js.mjs by embedding MoonBit FFI sync into an rslib plugin. Add shared @rivus/rslib-config package.

## 0.1.0

### Minor Changes

- 5d9d80b: Initial public release of the Agent Task Loop CLI.
