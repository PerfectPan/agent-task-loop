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

**P2c — providers + registry**
- `SessionProvider` interface + `FsSessionProvider` (list / getTranscript /
  resumeCommand over a fs root), and `codexProvider` / `claudeProvider` factories.
- `SessionRegistry` — aggregates providers: `list` merges newest-first,
  `getTranscript` / `resumeCommand` delegate to the owning provider.
  `defaultRegistry()` wires Codex + Claude.
- `resumeCommand` returns `null` by default; verified per-tool resume commands
  are wired in P5 (not guessed).

Still to come (see the plan): `agent-task-loop` composing this core (P3), the
browsing TUI (P4), resume (P5). OpenCode stays behind `SPIKE-OC` (SQLite).
