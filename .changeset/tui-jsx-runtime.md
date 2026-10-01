---
'@rivus/agent-task-loop': patch
'@rivus/agent-finder-cli': patch
---

Fix the published TUIs (`agent-task-loop tui` and `agent-finder sessions browse`) crashing on start with `ReferenceError: React is not defined`: the build now compiles JSX with the automatic runtime.
