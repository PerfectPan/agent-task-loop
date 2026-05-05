---
"@rivus/agent-task-loop": minor
---

Add global config fallback and `init` command.

- `task.config.json` is now a supported project config format alongside TypeScript/JavaScript configs.
- Config resolution falls back to `~/.agent-task-loop/config.json` when no project config is found.
- New `init` command detects `lark-cli` (and offers to install it), discovers available coding agents via `@rivus/agent-finder-core`, prompts for Feishu credentials, and writes the global config.
- "No config found" error now mentions `agent-task-loop init`.
