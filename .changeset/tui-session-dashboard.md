---
"@rivus/agent-task-loop": minor
---

feat(tui): interactive task + agent-session dashboard

Rebuild the `tui` command into a three-pane dashboard (task list · detail ·
live session preview) on a layered, fully-tested architecture:

- Pure, React-free logic (sort/filter/viewport/format/truncate/layout/heartbeat/
  session-history parsing) with exhaustive unit tests.
- Provider-agnostic data layer (`SessionProvider` + fs-backed implementation)
  and an injected clock, so the whole UI is deterministic under test.
- Performance: manual list windowing, memoized rows, and signature-gated
  polling to avoid re-render/flicker.
- CJK-aware truncation, semantic status colors, focus-aware borders, a help
  overlay, live filtering, and a `--demo` mode.
