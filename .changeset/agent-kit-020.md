---
'@rivus/agent-task-loop': patch
'@rivus/agent-finder-cli': patch
---

Upgrade agent-kit and agent-kit-collab from the 0.11.0 versions locked on main to 0.20.0, and Effect to 4.0.4 where used. Migrate discovery, identity and ACP integration to provider descriptors, retaining agent aliases, legacy recipes and room behavior.

For the seven built-in agents, `provider inspect` and `provider list` now show session and credential paths instead of the previous configuration-file paths, and their MCP configuration path lists are empty. `scan` no longer treats files such as `~/.codex/config.toml` or `~/.claude.json` as installation evidence: an installation represented only by those files changes from `found` to `missing`. These discovery changes arrived between kit 0.11.0 and 0.19.1; matching the 0.19.1 compatibility-check baseline does not imply unchanged output from main.
