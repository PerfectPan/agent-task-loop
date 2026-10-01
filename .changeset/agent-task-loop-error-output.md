---
'@rivus/agent-task-loop': patch
---

A failing command also prints the message of each error that caused it, the unexpected-argument error mentions boolean flags only when the stray value is `true` or `false`, and the `./rivus-plugin` tools report a field missing from their input as `is required`, for example `Invalid task-create title: is required`, instead of `has an invalid type`.
