---
"@rivus/agent-task-loop": minor
---

GitHub-Issues-only task source + JSON config (RFC 0005). `feishu` is now optional — configure at least one of `feishu` / `githubIssues`. Config is JSON-only and resolved from `--config` → `AGENT_TASK_LOOP_CONFIG` → `~/.agent-task-loop/config.json` (no more per-directory `task.config.*` discovery or `.ts`/`.js` config). The GitHub token falls back to `gh auth token`. `init` lets you pick the source(s); the TUI can publish a task as a linked GitHub issue and refine the description with AI (`Ctrl+R`, requires a `claude` agent).

`githubIssues` also supports **multiple repositories** via a `repositories[]` array — each becomes its own `github:<owner>/<repo>` task source (selectable in the TUI). To avoid adopting every issue in a repo, only issues that opt in are treated as tasks: those carrying the `<!-- task-id -->` marker (created through this tool) or an `agent:<name>` label (hand-off).

The TUI shows a compact per-row source tag (repo short name) and adds a `s` source-filter popup (multi-select, with a `src:` header chip) for focusing on specific repos; the `/` text filter now also matches source/repository.

Closes #24.
