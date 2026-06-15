---
"@rivus/agent-task-loop": patch
---

Internal refactor: the TUI's session discovery and transcript parsing now delegate to the shared `@rivus/agent-sessions` core (bundled into the published package), replacing the package-local copy. Preview output is unchanged — the transcript is mapped back through `toLines()` and the existing TUI tests are green.
