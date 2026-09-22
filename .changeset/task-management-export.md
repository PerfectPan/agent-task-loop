---
'@rivus/agent-task-loop': minor
---

Expose the task-management boundary as `@rivus/agent-task-loop/task-management`:
the task provider factory, the `TaskRecord` / `TaskStatus` vocabulary and the
status ordering, so a UI such as room-web can read the real task backends
without importing the CLI entry point.
