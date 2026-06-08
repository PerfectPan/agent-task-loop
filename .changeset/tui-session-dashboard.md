---
"@rivus/agent-task-loop": minor
---

feat(tui): interactive task + agent-session dashboard

Rebuild the `tui` command into a full-screen three-pane dashboard (task list ·
detail · live session preview) on a layered, fully-tested architecture:

- Pure, React-free logic (sort/filter/viewport/format/truncate/layout/heartbeat/
  session-history parsing) with exhaustive unit tests.
- Provider-agnostic data layer (`SessionProvider` + fs-backed implementation)
  and an injected clock, so the whole UI is deterministic under test.
- Performance: manual list windowing, memoized rows, and signature-gated
  polling to avoid re-render/flicker.
- CJK-aware truncation, semantic status colors, focus-aware borders, a help
  overlay, and live filtering.
- Runs full-screen on the alternate screen buffer by default.
- Create tasks without leaving the dashboard (`n`), with required-field
  validation; the footer shows an `[n] new` hint when creation is available.
- An in-app workflow diagram overlay (`w`) drawn as one connected diagram with
  the rework loop arc.
- Per-round transcript drill-in: each agent round resolves its own session and
  renders a chat-style transcript, with markers for which rounds are viewable
  on this machine.
