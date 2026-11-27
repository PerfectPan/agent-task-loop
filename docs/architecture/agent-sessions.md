# Agent Sessions

Session discovery and transcript reading come from `@rivus/agent-kit`'s
`/sessions` and `/transcript` entries (`@rivus/agent-kit`). The kit owns
the per-agent adapters; this repository holds the application-side wiring and
the resume command table. The former `@rivus/agent-sessions` package was
deleted when the kit replaced it.

## Model

- `listSessions(platform)` yields one `SessionHead` per session file across
  every built-in session adapter in `@rivus/agent-kit` (`claude-code`, `codex`,
  `dsh`, `gemini-cli`, `grok`, `opencode`, `pi`, `zcode`), plus a
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

Session roots follow `@rivus/agent-kit`'s per-agent home rules (environment
variables winning over defaults, for example `CODEX_HOME`, `CLAUDE_CONFIG_DIR`,
`GEMINI_CLI_HOME`, `GROK_HOME`, `PI_CODING_AGENT_DIR`, `XDG_DATA_HOME`). Node
hosts pass `createNodePlatform()`; every read goes through the platform.

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

- Resume prints a command; it does not start the agent. `sessions list --json`
  carries no resumability field; `sessions inspect --json` carries
  `resumeCommand` (`null` without a verified resume form), and the browser
  shows a resume line only when one exists.
- `loadTranscript` loads a complete session and is not a live file-following
  API. Views that only need numbers use `summarizeSession`.
- Traces are preview-grade: the CLI preview (`sessions/view.ts`) keeps
  message, reasoning and tool-call events and drops `tool_result` and the
  rest, with no diff or code-block rendering. The browser shows only the last
  lines of a trace, with no scrolling or search.
- The TUI preview renders the transcript's message, reasoning and tool-call
  events. A Codex rollout records each turn twice (the CLI's `event_msg` copy
  and the model's `response_item` copy); the kit attributes the message to the
  `response_item` only, so each turn renders once — the
  `fs-session-provider` regression test pins this.
- Further session adapter and trace enhancements live upstream in
  `@rivus/agent-kit`.
