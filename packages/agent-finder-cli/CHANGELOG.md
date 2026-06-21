# @rivus/agent-finder-cli

## 0.2.0

### Minor Changes

- 480e372: Add a `sessions` command to browse and inspect local coding-agent sessions across Codex and Claude (backed by the shared `@rivus/agent-sessions` core):

  - `agent-finder sessions browse` — interactive two-pane TUI: session list + transcript preview, ↑/↓ navigation, `q` to quit.
  - `agent-finder sessions list [--agent <a>] [--filter <s>] [--json]` — aligned, color-coded table; `--json` emits a stable `{ schema_version, sessions }` payload.
  - `agent-finder sessions inspect <id> [--json]` — session metadata + transcript.

- 69d83c9: Add session resume support (print-only): `agent-finder sessions resume <id>` prints the verified command to resume a session in its agent (`codex resume <id>` / `claude --resume <id>`), `sessions inspect` shows it (and includes `resumeCommand` in `--json`), and the `sessions browse` TUI shows a resume hint for the selected session. The command is printed, never executed.

## 0.1.3

### Patch Changes

- 5c3c6b0: Redesign all human CLI output (#23) onto a small shared presentation layer:

  - `scan`: aligned, color-coded table with a status glyph, a new version column, and a status summary footer (the per-status counts were previously computed but never printed).
  - `provider list`: aligned ID/Name/Adapter table (was tab-separated).
  - `provider inspect`: bold title with aligned, dimmed key labels.
  - `doctor`: bold total plus glyph/color-coded status counts.

  Color is emitted only on an interactive TTY and suppressed under `NO_COLOR`; `scan --json` output is unchanged.

## 0.1.2

### Patch Changes

- Updated dependencies [c7a99de]
  - @rivus/agent-finder-core@0.1.2

## 0.1.1

### Patch Changes

- 4272fb1: Replace tsup with rslib for all packages. Eliminate scripts/sync-moonbit-js.mjs by embedding MoonBit FFI sync into an rslib plugin. Add shared @rivus/rslib-config package.
- Updated dependencies [4272fb1]
  - @rivus/agent-finder-core@0.1.1

## 0.1.0

### Minor Changes

- 22de691: Add the initial agent finder packages with a MoonBit discovery core, JavaScript wrapper, and CLI.

### Patch Changes

- Updated dependencies [22de691]
  - @rivus/agent-finder-core@0.1.0
