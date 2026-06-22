---
"@rivus/agent-task-loop": patch
---

CompositeTaskProvider reads are now fault-tolerant: a source that fails to read (e.g. a Feishu Base whose lark-cli auth is missing the `base:record:read` scope) is **skipped with a warning** instead of failing the whole read. Previously `listTasks`/`listPendingTasks` used `Promise.all`, so one unhealthy source blanked the entire board (the TUI showed "No tasks" and hid healthy GitHub tasks); `getTaskById` likewise threw if an earlier source errored. Now healthy sources always come through and the failing source is reported on stderr.
