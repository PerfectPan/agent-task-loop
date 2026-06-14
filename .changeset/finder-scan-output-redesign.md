---
"@rivus/agent-finder-cli": patch
---

Redesign `agent-finder scan` human output (#23): an aligned, color-coded table with a status glyph, a new version column, and a status summary footer (the per-status counts were previously computed but never printed). Color is emitted only on an interactive TTY and suppressed under `NO_COLOR`; `scan --json` output is unchanged.
