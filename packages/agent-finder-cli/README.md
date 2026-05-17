# agent-finder-cli

Command-line interface for local code agent discovery.

```bash
agent-finder scan
agent-finder scan --json
agent-finder provider -h
agent-finder provider list
agent-finder provider inspect codex
agent-finder sessions list
agent-finder sessions list --root ~/.codex/sessions --json
agent-finder doctor
```

The CLI uses `@rivus/agent-finder-core` for provider metadata and read-only host probing.

## Sessions

`agent-finder sessions list` scans known local session roots when they exist. Pass `--root <path>` to inspect one explicit directory.

The current session browser is read-only. It lists session-like files and extracts metadata from JSON files when fields such as `id`, `agent`, `title`, and `updatedAt` are present. Interactive TUI navigation and resume actions are planned follow-ups.
