---
"@rivus/agent-finder-cli": minor
---

Add a `sessions` command to browse and inspect local coding-agent sessions across Codex and Claude (backed by the shared `@rivus/agent-sessions` core):

- `agent-finder sessions browse` — interactive two-pane TUI: session list + transcript preview, ↑/↓ navigation, `q` to quit.
- `agent-finder sessions list [--agent <a>] [--filter <s>] [--json]` — aligned, color-coded table; `--json` emits a stable `{ schema_version, sessions }` payload.
- `agent-finder sessions inspect <id> [--json]` — session metadata + transcript.
