---
"@rivus/agent-task-loop": patch
---

Fix `complete`/auto-publish committing agent-task-loop's own `.agent-task-loop/` runtime bookkeeping directory (session logs) into the task's commit. `GitPublishService.commitAll` used `git add -A`, which only skips a path when the *target* repo's own `.gitignore` covers it — since agent-task-loop runs against arbitrary repos, a repo without that rule got its run logs (which embed local absolute paths) committed and pushed. `commitAll` now excludes `.agent-task-loop/` via an explicit pathspec regardless of the target repo's `.gitignore`.
