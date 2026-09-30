# Agent Sessions

`@rivus/agent-sessions` (`packages/agent-sessions`) discovers coding-agent
sessions on disk and parses their transcripts. It is internal: bundled into
`@rivus/agent-finder-cli` by rslib and consumed as `workspace:*` by
`@rivus/agent-task-loop`. It has no dependency on `TaskRecord`, citty, Ink, or
MoonBit.

## Model

- `Session` is tool-agnostic: `id`, `agent` (attributed from the source root),
  optional `title`, `cwd`, `path`, `createdAt`, `messageCount`, `updatedAt`
  (metadata, else file mtime), and `resumable`.
- `TranscriptEntry` is one turn: `role` (`user`, `assistant`, `reasoning`,
  `tool`), preview `text`, optional `toolName` and `timestamp`.
  `parseTranscript` reads Codex rollout JSONL (`{type, payload}`) and Claude
  session JSONL (`{message: {role, content}}`). Token-count payloads are
  dropped.
- `toLines` renders entries back to the legacy `role: text` strings the
  agent-task-loop TUI uses.

## Discovery

- `defaultSessionRoots` are `~/.codex/sessions` and `~/.claude/projects`,
  derived from the home directory. `CLAUDE_CONFIG_DIR` and Codex
  `archived_sessions` are not consulted.
- `buildFsIndex` walks the roots under a scan budget and depth cap, matches
  UUID-named `.jsonl` files, never throws, and takes injectable `readdir` and
  `stat` for tests.
- `SessionProvider` (`list`, `getTranscript`, `resumeCommand`) is implemented by
  `FsSessionProvider`; `codexProvider` and `claudeProvider` configure it.
  `SessionRegistry` merges providers newest-first and delegates per id;
  `defaultRegistry()` wires Codex and Claude.

## Consumers

- `agent-finder-cli sessions` opens an Ink browser: a list pane, a trace
  preview, keyboard navigation, and a printed resume command.
  `sessions list` and `sessions inspect <id>` (both with `--json`) and
  `sessions resume <id>` are the scripting forms.
- The agent-task-loop TUI reads task-linked transcripts through the same core
  (`packages/agent-task-loop/src/tui/data/fs-session-provider.ts`); the
  task-to-session link stays in agent-task-loop.
- CLI output (`scan`, `provider`, `doctor`, `sessions`) renders through one
  presentation layer in `packages/agent-finder-cli/src/formatters/`: column
  schemas, status theming, key-value blocks, and TTY/`NO_COLOR` gating.

## Limits

- Resume prints a command; it does not start the agent. Codex
  (`codex resume <id>`) and Claude (`claude --resume <id>`) are supported.
- OpenCode stores sessions in SQLite with `ses_…` ids, so it has no provider
  and `resumable` is false for it.
- Traces are preview-grade: no `tool_result` bodies, diffs, or code-block
  rendering, and no in-trace search.

Remaining work is tracked in
[`specs/0016-opencode-sessions-and-trace-fidelity.md`](../../specs/0016-opencode-sessions-and-trace-fidelity.md).
