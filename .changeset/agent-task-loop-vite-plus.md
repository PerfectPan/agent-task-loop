---
'@rivus/agent-task-loop': patch
---

Build the published JavaScript with Vite+ (`vp pack`). The published file set changes from fixed chunks to hashed chunks plus a separate `task-provider` declaration file; imports and exports are unchanged.
