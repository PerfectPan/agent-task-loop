---
"@rivus/agent-task-loop": patch
---

Fix `complete`/auto-publish failing outright with "paths are ignored by one of your .gitignore files" once a target repo's own `.gitignore` covers `.agent-task-loop/` (as this repo's now does, per the prior fix in #83). `GitPublishService.commitAll` used a pathspec exclusion (`-- . ':!.agent-task-loop'`), which git treats as an error when the excluded path is *already* gitignored. Switched to `git add -A` followed by `git reset -- .agent-task-loop`, which is a no-op whether the path was ignored, untracked, or absent — and still keeps the directory out of the commit either way.
