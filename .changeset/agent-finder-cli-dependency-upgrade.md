---
'@rivus/agent-finder-cli': patch
---

Upgrade the runtime dependencies to Ink 6 with React 19 and citty 0.2. `-v` prints the version, `--help` output uses citty 0.2's layout, and a value after a boolean flag is no longer read as the flag's value (`--json false` turns JSON output on; use `--no-json`).
