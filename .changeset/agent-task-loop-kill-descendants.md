---
'@rivus/agent-task-loop': patch
---

Cancelling a run now kills the descendant processes the command spawned (for example `sh -c 'sleep 5'` keeps running today after the direct child dies), via execa's `killDescendants` on both subprocess wrappers that support cancellation.
