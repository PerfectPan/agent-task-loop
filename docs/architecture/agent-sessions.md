# Agent Sessions

Session discovery and transcript reading come from `@rivus/agent-kit`'s
`/sessions` and `/transcript` entries (`@rivus/agent-kit` 0.11.0). The kit owns
the per-agent adapters; this repository holds the application-side wiring and
the resume command table. The former `@rivus/agent-sessions` package was
deleted when the kit replaced it.

## Model

- `listSessions(platform)` yields one `SessionHead` per session file across
  every built-in session adapter (claude-code, codex, grok), plus a
  `SessionListFailure` for each root or file that could not be listed. A head
  carries `ref` (agent id, path, session id), `title`, `cwd`, `startedAt`,
  `lastActiveAt` (epoch ms), `sizeBytes` and `firstPrompt`;
  `isSessionHead` converges the failures. `@rivus/agent-kit/testing` has a
  `sessionAdapterConformance` suite for adapters.
- `loadTranscript(platform, ref)` reads a session into a `Transcript`:
  ordered `TranscriptEvent`s (`user`, `assistant`, `reasoning`, `tool_call`,
  `tool_result`, `request`, `system`, `compaction`, `hook`, `unknown`) across
  lanes, with the session's meta. Expected failures are `Result` values, not
  exceptions.
- `summarizeSession` reads a bounded summary (turns, requests, usage,
  durations, failed tools) without holding the transcript; `readOriginal`
  reads one event's source record back.
- Resume is not a kit concept. Each application keeps one resume table:
  `packages/agent-task-loop/src/session/resume.ts` and
  `packages/agent-finder-cli/src/sessions/resume.ts` print
  `codex resume <id>` / `claude --resume <id>`; agents without a verified
  resume form resolve to `null`.

## Discovery

Kit home rules, with environment variables winning over defaults: Codex
`CODEX_HOME` (else `~/.codex`) lists both `sessions/` and `archived_sessions/`;
Claude Code `CLAUDE_CONFIG_DIR` (else `~/.claude`) lists `projects/`, skipping
each session's `subagents/` directory; grok `GROK_HOME` (else `~/.grok`) lists
`sessions/`. Node hosts pass `createNodePlatform()`; every read goes through
the platform.

## Consumers

- `agent-finder-cli sessions` opens an Ink browser: a list pane, a trace
  preview, keyboard navigation, and a printed resume command.
  `sessions list` and `sessions inspect <id>` (both with `--json`) and
  `sessions resume <id>` are the scripting forms. Listing and resolution live
  in `packages/agent-finder-cli/src/sessions/`.
- The agent-task-loop TUI reads task-linked transcripts through
  `packages/agent-task-loop/src/tui/data/fs-session-provider.ts`: the tail of
  the task's log file first, then the transcript resolved from the task's
  session id, rendered as `role: text` / `⚙ tool` preview lines. The
  task-to-session link stays in agent-task-loop.
- CLI output (`scan`, `provider`, `doctor`, `sessions`) renders through one
  presentation layer in `packages/agent-finder-cli/src/formatters/`: column
  schemas, status theming, key-value blocks, and TTY/`NO_COLOR` gating.

## Limits

- Resume prints a command; it does not start the agent.
- `loadTranscript` loads a complete session and is not a live file-following
  API. Views that only need numbers use `summarizeSession`.
- Traces are preview-grade: no `tool_result` bodies, diffs, or code-block
  rendering, and no in-trace search.
- The TUI preview renders the transcript's message, reasoning and tool-call
  events. A Codex rollout records each turn twice (the CLI's `event_msg` copy
  and the model's `response_item` copy); the kit attributes the message to the
  `response_item` only, so each turn renders once — the
  `fs-session-provider` regression test pins this.

OpenCode sessions and trace fidelity remain tracked in
[`docs/specs/0016-opencode-sessions-and-trace-fidelity.md`](../specs/0016-opencode-sessions-and-trace-fidelity.md).
