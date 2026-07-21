---
"@rivus/agent-task-loop": minor
---

Export `@rivus/agent-task-loop/task-manager` subpath exposing the
`TaskManagerApplication` boundary, types, errors, `toPublicTask`,
`createConfiguredTaskManagerApplication`, input schemas, and the
desktop-only `BackgroundStartService` / `RunPhaseRegistry`. Import has
no config or network side effects until a factory is called.
