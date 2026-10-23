---
'@rivus/agent-task-loop': patch
'@rivus/agent-finder-cli': patch
---

Upgrade `@rivus/agent-kit` and `@rivus/agent-kit-collab` to 0.21.1 and Effect to 4.0.5 where pinned. No application behavior changes: the session previews, resume tables, lease and lane integrations keep their current shape, and the full suite passes unchanged.

The kit-side fixes flow through to users of these packages: `agent-finder sessions` listings and the task-loop TUI preview show corrected Claude Code prompts, turns and titles (IDE context and system reminders are host-added text, prompts are trimmed) and unique Codex event ids; redaction also hides home paths hidden behind JSON escapes, URL encoding and ANSI colour codes; on the live ACP path a tool call that outlives its turn is no longer emitted twice.
