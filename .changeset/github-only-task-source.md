---
"@rivus/agent-task-loop": minor
---

GitHub-Issues-only task source + JSON config (RFC 0005). `feishu` is now optional — configure at least one of `feishu` / `githubIssues`. Config is JSON-only and resolved from `--config` → `AGENT_TASK_LOOP_CONFIG` → `~/.agent-task-loop/config.json` (no more per-directory `task.config.*` discovery or `.ts`/`.js` config). The GitHub token falls back to `gh auth token`. `init` lets you pick the source(s); the TUI can publish a task as a linked GitHub issue and refine the description with AI (`Ctrl+R`, requires a `claude` agent). Closes #24.
