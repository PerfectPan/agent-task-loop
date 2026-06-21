# @rivus/agent-task-loop

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
