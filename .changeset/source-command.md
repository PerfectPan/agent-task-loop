---
"@rivus/agent-task-loop": minor
---

Add a `source` command to manage task sources without hand-editing the config (RFC 0007). `agent-task-loop source list` shows configured sources and the default; `source add --type github|feishu …` merges a source into the existing config (a second GitHub repo appends to `repositories[]`); `source remove <id>` drops one (keeping ≥1). Flags drive non-interactive use; a TTY prompts for missing values and prefills owner/repo from `gh repo view`. `init` now points at `source add` when a config already exists.
