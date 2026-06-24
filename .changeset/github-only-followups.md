---
"@rivus/agent-task-loop": minor
---

Fix a batch of GitHub-only correctness, robustness and UX issues found by a full audit:

- **prLink no longer = the issue URL.** `mapIssue` used to stamp the issue's `html_url` into `prLink`, which (a) showed the issue link in the TUI "PR" field and (b) made `DeliveryCheckService` treat every GitHub task as already-published, skipping the real working-tree/new-commit check. The real PR link now comes only from the run-time store.
- **GitHub setup is no longer a trap.** `source add` / `init` now scaffold the matching `projects[<repo>]` / `repositories[<owner>/<repo>]` entries (keyed exactly as the run path expects), the shipped `config.example.json` is correctly keyed, and `assertRuntimeConfig` fails fast with an actionable error when a GitHub source has no matching project/repository or a `localPath`/`workspaceRoot` is unset — instead of a cryptic per-task "unknown project" mid-run.
- **Cleanup keeps the task's outcome.** `updateCleanupState` now clears only transient run-time fields and preserves `status`, `prLink`, publish info and session history — so a finished GitHub task keeps showing its PR + transcript and never resurrects to 待处理 (an earlier fix over-cleared and wiped them).
- **Agent reassignment persists on GitHub.** `updateTaskAssignment` now rewrites the issue's `agent:<name>` label (was a no-op, so the new agent never saw the task).
- **`complete` is more robust:** refuses to publish when the workspace is on the default branch (parity with auto-publish), and a missing PR-description process-summary is now a warning rather than a hard failure that left a dangling open PR with the task stuck pre-已完成.
- **Clearer push failures:** a non-fast-forward push is reported with actionable guidance instead of a raw git error.
- **TUI:** the session/transcript index refreshes on a stale miss (sessions created after startup are now found instead of "Transcript not found"), and scrollable panes add slack so long transcripts/detail can always be scrolled to the bottom.
- **Hygiene:** the run-time state store now prunes orphaned entries (180-day TTL), and `listTasks` warns instead of silently truncating when a repo exceeds the 1000-issue page cap.

Known design limits (not changed): intermediate statuses are machine-local (cross-machine reads fall back to the issue's open/closed), and terminal mouse/drag selection of wrapped URLs is a terminal-takeover limitation.
