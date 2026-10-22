---
'@rivus/agent-finder-cli': minor
'@rivus/agent-task-loop': minor
---

Detect installed agents with `@rivus/agent-kit` 0.20.0 instead of the MoonBit scanner, and require Node.js 22.13 or newer (the kit's Node adapters).

The kit supports 7 agents with built-in probe recipes: claude-code, codex, cursor, gemini-cli, grok, opencode, pi. `agent-finder-cli` keeps the other 20 catalog entries through its own probe recipes (`openhands`, `cline`, `codebuddy`, `command-code`, `kiro-cli`, `antigravity`, `roo-code`, `github-copilot`, `amp`, `openclaw`, `neovate`, `qoder`, `zencoder`, `kimi-code-cli`, `windsurf`, `vscode-copilot`, `codex-desktop`, `aider`, `hermes`, `trae`), so `scan`, `provider list`, `provider inspect` and `doctor` list 27 agents: the previous 26 plus the kit's `grok`.

Differences accepted in the parity comparison, for the same probe inputs:

- Report order changes: the kit's built-in agents come first (claude-code, codex, cursor, gemini-cli, grok, opencode, pi), then the legacy recipes; the MoonBit scanner used catalog file order.
- The conservative "provider metadata" warnings on opencode and pi no longer appear; the kit's recipes for them carry no warnings, while the 20 legacy recipes keep theirs verbatim.
- Cursor checks its global storage and credential paths, includes `cursor-agent` as a command name, and keeps two caveats about not following `CURSOR_CONFIG_DIR`/`XDG_CONFIG_HOME` and not probing the command name `agent`.
- The built-in recipes report session and credential paths as configuration candidates and no MCP configuration candidates; legacy recipes keep their original paths.
- Each installation carries the new `auth` (file-based login state) and `problems` (checks that could not complete) fields; `agent-finder scan --json` prints that installation array instead of the old `schema_version: "0.1"` report.
- `agent-task-loop init` detects claude-code and codex with `versionProbe: false`, so it never executes an agent command; an agent is configured when its command is found on `PATH`, where discovery previously also required a successful `--version` run.
