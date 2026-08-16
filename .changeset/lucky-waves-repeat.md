---
'@rivus/agent-task-loop': minor
---

Add grok as a coding provider and make the reviewer agent configurable. `TARGET_AGENTS` now includes `grok` (adapters, config schema, Feishu TargetAgent options, source commands), and `review.reviewerAgent` in app config selects the review-round agent (defaults to `codex`). Claims now carry compare-and-swap semantics: `claimTask` accepts `expectedStatuses` and rejects concurrent claims with a stable `task-state-conflict` error (`TaskStateConflictError`) when another run already moved the task forward — the roll-call problem backstop from RFC 0010.
