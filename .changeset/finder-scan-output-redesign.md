---
"@rivus/agent-finder-cli": patch
---

Redesign all human CLI output (#23) onto a small shared presentation layer:

- `scan`: aligned, color-coded table with a status glyph, a new version column, and a status summary footer (the per-status counts were previously computed but never printed).
- `provider list`: aligned ID/Name/Adapter table (was tab-separated).
- `provider inspect`: bold title with aligned, dimmed key labels.
- `doctor`: bold total plus glyph/color-coded status counts.

Color is emitted only on an interactive TTY and suppressed under `NO_COLOR`; `scan --json` output is unchanged.
