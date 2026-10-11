---
'@rivus/agent-finder-cli': minor
'@rivus/agent-task-loop': minor
---

Discover sessions and read transcripts with `@rivus/agent-kit` 0.11.0 (`/sessions` + `/transcript`) instead of the deleted internal `@rivus/agent-sessions` package. Resume command strings stay application-side: `packages/agent-finder-cli/src/sessions/resume.ts` and `packages/agent-task-loop/src/session/resume.ts` are the single sources (`codex resume <id>`, `claude --resume <id>`).

Differences accepted in the parity comparison against the old package, for the same on-disk fixtures:

- The session list covers more sessions: Codex `archived_sessions/` is scanned, `CODEX_HOME` and `CLAUDE_CONFIG_DIR` are honored, and grok sessions are included. The old scanner only walked `~/.codex/sessions` and `~/.claude/projects`.
- Claude subagent transcripts (`<session>/subagents/agent-*.jsonl`) are no longer listed as independent sessions; their turns appear inside the parent session's transcript instead.
- `agent-finder sessions list --json` prints kit session heads (`ref`, `lastActiveAt` epoch ms, `sizeBytes`, `firstPrompt`, …) instead of the old `Session` shape, and `--agent claude` is accepted as an alias of `claude-code`. `sessions inspect --json` prints the transcript as kit transcript events.
- Timestamps: `updatedAt` (file mtime, ISO) becomes `lastActiveAt` (the last record time read from the file's head and tail, epoch ms).
- A Codex rollout records each turn twice (the CLI's `event_msg` copy and the model's `response_item` copy). The preview renders each turn once, attributed to the `response_item`; the old parser rendered both copies. A regression test pins the single count.
- The task-loop TUI preview and the sessions browser read transcript events (`user`/`assistant`/`reasoning`/`tool_call`); tool calls render as `⚙ tool` regardless of which agent emitted them.
