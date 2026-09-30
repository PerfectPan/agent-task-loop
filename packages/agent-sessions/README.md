# @rivus/agent-sessions

Tool-agnostic coding-agent **session** discovery and transcript parsing, shared
by `agent-finder-cli` (standalone, cross-tool browsing) and `agent-task-loop`
(task-linked TUI). Internal package — bundled into consumers, not published.

See [`docs/architecture/agent-sessions.md`](../../docs/architecture/agent-sessions.md).

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
- `resumeCommand` returns `null` unless the provider is given a verified
  per-tool resume command.

**Consumers**
- `agent-task-loop`'s TUI composes this core (`toLines()`).
- `agent-finder-cli sessions` browses, lists, inspects, and prints resume
  commands (Codex `codex resume <id>`, Claude `claude --resume <id>`).

Not yet: OpenCode (SQLite store) and higher-fidelity traces, tracked in
[`specs/0016-opencode-sessions-and-trace-fidelity.md`](../../specs/0016-opencode-sessions-and-trace-fidelity.md).
