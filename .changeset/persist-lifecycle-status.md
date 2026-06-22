---
"@rivus/agent-task-loop": minor
---

Close the GitHub-Issues task source to full parity with Feishu so the loop runs end-to-end (publish → execute → review → complete → cleanup, plus reject/watch/resume) on a GitHub-only setup.

GitHub issues are binary (open/closed ⇒ 待处理 / 已完成), so every intermediate lifecycle status (执行中 / 待复核 / 待发布 / 待验收 / 修复中 / 已失败) is owned by the loop and persisted in the run-time state store, then overlaid on reads:

- `status` is mirrored in the local store: `updateReviewState` carries it; `StatefulTaskProvider` injects the implied 执行中 on claim, 待验收 on succeed (matching Feishu, not 已完成), and 已失败 on fail. So `complete` (gates on 待验收/待发布), `reject`, `cleanup`, `watch` and `start` recovery read the correct status across separate commands.
- **`listPendingTasks` now filters on the overlaid status**, not the backend's raw open/closed. Previously an in-flight or finished GitHub task (issue still open) was re-offered as pending and could be re-claimed.
- **`updateCleanupState` preserves the lifecycle `status`** while dropping transient run-time fields, so a finished task never resurrects to 待处理 after cleanup (Feishu keeps Status across cleanup; we mirror that).
- **The GitHub issue closes on the terminal 已完成 transition** (via `updateReviewState`), so the binary backend itself records completion even if the run-time store is later cleared. `markTaskSucceeded` (待验收) no longer closes the issue.
- `listTasks` paginates (`state=all`, 100/page, up to 1000) for read parity with Feishu's full list.

Adds unit coverage for each behaviour plus two end-to-end tests over the real provider stack (`StatefulTaskProvider` + file-backed store + an in-memory fake GitHub API): a full execute→review→publish→complete→cleanup walk asserting status parity and no resurrection, and the real `CompleteService` publishing a 待发布 GitHub task and closing its issue. Cross-machine remains a non-goal. Feishu is unaffected.
