---
"@rivus/agent-task-loop": minor
---

Persist lifecycle `status` in the run-time state store so the GitHub-Issues-only loop works end-to-end through the tool. GitHub issues are only open/closed (待处理 / 已完成), so intermediate statuses (执行中 / 待复核 / 待发布 / 待验收 / 已失败) used to vanish on re-read — breaking `complete` (guards on 待验收/待发布), `reject`, `cleanup`, `watch` (terminal-status detection) and `start` recovery across separate commands, and letting an in-flight task be re-claimed. `status` is now mirrored in the local store (`StatefulTaskProvider` injects the implied 执行中/已完成/已失败 on claim/succeed/fail; `updateReviewState` already carries it), so on the same machine the full run→review→publish→complete→cleanup chain reads the correct status. Cross-machine remains a non-goal (agent transcripts are machine-local too). Feishu is unaffected.
