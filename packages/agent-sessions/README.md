# @rivus/agent-sessions

Tool-agnostic coding-agent **session** discovery and transcript parsing, shared
by `agent-finder-cli` (standalone, cross-tool browsing) and `agent-task-loop`
(task-linked TUI). Internal package — bundled into consumers, not published.

See the design in [`docs/plans/issue-25-shared-sessions.md`](../../docs/plans/issue-25-shared-sessions.md).

## Status

Phase **P2a** — transcript model + parser. Implemented:

- `TranscriptEntry` — structured turn (`role`, `text`, optional `toolName` /
  `timestamp`), replacing the lossy `role: text` strings the parser used to emit.
- `parseTranscript` / `parseTranscriptLine` — parse Codex rollout
  (`{type, payload}`) and Claude session (`{message:{role, content}}`) JSONL.
- `toLines` — reconstruct the legacy string format so `agent-task-loop`'s
  renderer stays byte-identical during migration.

Still to come (see the plan): the bounded filesystem session index (P2b),
`SessionRegistry` + per-tool providers (P2c), and resume support (P5).
