---
"@rivus/agent-finder-cli": minor
---

Add session resume support (print-only): `agent-finder sessions resume <id>` prints the verified command to resume a session in its agent (`codex resume <id>` / `claude --resume <id>`), `sessions inspect` shows it (and includes `resumeCommand` in `--json`), and the `sessions browse` TUI shows a resume hint for the selected session. The command is printed, never executed.
