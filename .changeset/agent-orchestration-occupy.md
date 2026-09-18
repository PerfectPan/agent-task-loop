---
'@rivus/agent-task-loop': minor
---

Start occupies `@rivus/agent-orchestration` (`task:<id>`) before the review loop. A second concurrent start loses with a stable conflict and does not claim the task backend.
