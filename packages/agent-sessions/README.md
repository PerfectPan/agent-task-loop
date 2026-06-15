# @rivus/agent-sessions

Tool-agnostic coding-agent **session** discovery and transcript parsing, shared
by `agent-finder-cli` (standalone, cross-tool browsing) and `agent-task-loop`
(task-linked TUI). Internal package — bundled into consumers, not published.

See the design in [`docs/plans/issue-25-shared-sessions.md`](../../docs/plans/issue-25-shared-sessions.md).

## Status

Implemented:

**P2a — transcript model + parser**
- `TranscriptEntry` — structured turn (`role`, `text`, optional `toolName` /
  `timestamp`), replacing the lossy `role: text` strings the parser used to emit.
- `parseTranscript` / `parseTranscriptLine` — parse Codex rollout
  (`{type, payload}`) and Claude session (`{message:{role, content}}`) JSONL.
- `toLines` — reconstruct the legacy string format so `agent-task-loop`'s
  renderer stays byte-identical during migration.

**P2b — session model + bounded fs index**
- `Session` / `AgentKind` — tool-agnostic session shape.
- `buildFsIndex` — bounded (`scanBudget` / `maxDepth`), never-throwing walk that
  maps `id → Session` from UUID-named `.jsonl` transcripts, attributing the
  agent from the root and `updatedAt` from file mtime. Injectable `readdir` /
  `stat` for tests. Generalized from agent-task-loop's `fs-session-provider`.
- `defaultSessionRoots` — the standard Codex/Claude roots.

Still to come (see the plan): `SessionRegistry` + per-tool providers (P2c),
`agent-task-loop` composing this core (P3), the browsing TUI (P4), resume (P5).
OpenCode stays behind `SPIKE-OC` (SQLite).
