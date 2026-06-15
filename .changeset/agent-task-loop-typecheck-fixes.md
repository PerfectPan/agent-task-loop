---
"@rivus/agent-task-loop": patch
---

Fix latent type errors surfaced by the new CI typecheck gate:

- `watch`: return `0` (not `undefined`) for `nextOffset` when a log read fails, so the next poll resumes from a valid offset.
- `workspace`: narrow `existingWorkspacePath` before returning it.
- `schema`: type the field-detail list as `ExistingField[]` so `id`/`options` lookups are sound.
- `review-loop`: include `acceptanceFeedback` in the reviewer dependency's input type.
