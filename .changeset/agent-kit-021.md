---
'@rivus/agent-task-loop': patch
'@rivus/agent-finder-cli': patch
---

Upgrade `@rivus/agent-kit` and `@rivus/agent-kit-collab` to 0.21.1 and Effect to 4.0.5 where pinned.

`agent-finder sessions list --filter` matches Claude Code sessions against the kit's corrected title and first prompt — now the user's own text, with IDE context blocks and system reminders counted as host-added — so a filter on an opened-file name no longer matches, and a session that opens with a system reminder now matches on the user's words.
