# RFC 0002: Code Agent Discovery

## Status

Proposed

## Summary

Add `agent-finder`, a local read-only code agent inventory provider for Agent Task Loop. It discovers common coding agents installed on the current machine and reports stable structured output that Agent Task Loop can consume later.

The tool is not a scheduler, runner, terminal multiplexer, API proxy, or credentials reader. It only checks commands, application paths, configuration path existence, MCP configuration path existence, and safe version commands.

## Motivation

Agent Task Loop already orchestrates work across coding agent workflows, but it has no stable local inventory of which agents are available on a developer machine. Without that inventory, higher-level workflows either need hard-coded assumptions or repeated ad hoc checks.

A dedicated discovery tool gives the project:

- a stable local source of truth for installed code agents
- a narrow privacy boundary for host scanning
- predictable JSON for future JavaScript, wasm, or npm wrappers
- a place to evolve agent-specific detection logic without coupling it to task execution

## Goals

- Implement the discovery tool in MoonBit.
- Split the implementation into a core package and a CLI package.
- Keep core models and APIs stable enough for future JS bindings or wasm use.
- Support macOS first while leaving the model portable for Linux and Windows.
- Detect common code agents:
  - Codex
  - Claude Code
  - Gemini CLI
  - opencode
  - aider
  - GitHub Copilot CLI
  - Cursor
  - Windsurf
  - VS Code Copilot
  - Codex Desktop
- Report, per agent:
  - `id`
  - `name`
  - `type`
  - `status`
  - `command`
  - `app_path`
  - `version`
  - `config_paths`
  - `mcp_config_paths`
  - `warnings`
- Provide:
  - `agent-finder scan`
  - `agent-finder scan --json`
  - `agent-finder doctor`
- Add core scanner tests for data modeling, path detection, JSON serialization, and diagnostics.

## Non-Goals

- Execute agent tasks.
- Start agent sessions.
- Queue or schedule work.
- Take over terminals.
- Proxy API requests.
- Read token contents or parse secrets.
- Upload local inventory data.
- Fully implement platform-specific Linux and Windows probing in the first version.
- Prove editor extension installation by reading full extension metadata in the first version.

## Proposed Design

### Package Layout

Add a MoonBit module under `packages/agent-finder`:

- `agent_discovery_core`: scanning model, agent definitions, path expansion, status derivation, JSON serialization, and doctor summaries.
- `agent_finder_cli`: command-line parsing, host probes, version command calls, and human-readable formatting.

The repository root scripts should include the MoonBit package in normal validation:

- `pnpm test` also runs `moon test --manifest-path packages/agent-finder/moon.mod.json`.
- `pnpm build` also runs default and JS-target MoonBit builds.

### Core API

The core package exposes plain data records:

- `Probe`: all host facts supplied to the scanner.
- `HostInfo`: `os` and `arch`.
- `AgentRecord`: one discovered agent result.
- `DiscoveryReport`: complete scan output.
- `DoctorSummary`: aggregate diagnostics.

The core scanner receives a `Probe` rather than touching the host directly. This keeps the core deterministic, testable, and suitable for future bindings.

The core package also exposes candidate lists:

- `known_command_candidates()`
- `known_path_candidates()`

The CLI uses those lists to collect host facts. Future JS or wasm wrappers can do the same without duplicating agent definitions.

### Status Semantics

Status values are stable strings:

- `runnable`: a command exists and is executable. For checks that require an extension subcommand, the relevant version probe must also succeed.
- `found`: an app path, command path, config path, or MCP config path exists, but the scanner cannot prove runnable CLI execution.
- `missing`: no known command, app, config, or MCP path was found.
- `unknown`: reserved for future platform or probe failures that cannot be classified safely.

### JSON Schema

The JSON output is versioned with `schema_version: "0.1"`:

```json
{
  "schema_version": "0.1",
  "generated_at": "2026-05-03T00:00:00+08:00",
  "host": {
    "os": "darwin",
    "arch": "arm64"
  },
  "agents": [
    {
      "id": "codex",
      "name": "Codex",
      "type": "cli",
      "status": "runnable",
      "command": "/opt/homebrew/bin/codex",
      "app_path": null,
      "version": "0.x",
      "config_paths": ["~/.codex"],
      "mcp_config_paths": ["~/.codex/config.toml"],
      "warnings": []
    }
  ]
}
```

The core implements explicit JSON serialization for nullable string fields so consumers receive `null`, not MoonBit's derived option representation.

### CLI Behavior

The CLI provides:

- `scan`: human-readable table with status, type, agent name, and command or app location.
- `scan --json`: stable machine-readable report.
- `doctor`: aggregate counts, missing agents, and warnings.

The repository also includes a small Node wrapper at `packages/agent-finder/bin/agent-finder.mjs` so the local command shape is:

```bash
node packages/agent-finder/bin/agent-finder.mjs scan
node packages/agent-finder/bin/agent-finder.mjs scan --json
node packages/agent-finder/bin/agent-finder.mjs doctor
```

### Host Probes

The CLI owns host interaction:

- command lookup through `/usr/bin/which`
- filesystem existence checks through Node `fs.existsSync`
- executable checks through Node `fs.accessSync` with `X_OK`
- version checks through bounded `execFileSync` calls with fixed argument arrays and short timeouts

The scanner does not read config file contents. It only checks whether known config paths exist.

### Privacy and Safety Boundary

The default scan is local and read-only:

- no uploads
- no API calls
- no token parsing
- no config content parsing
- no agent task execution
- no terminal takeover

Version checks are limited to conventional `--version` style calls or equivalent read-only CLI version probes. They are allowed because they do not start agent task sessions or submit prompts.

## Alternatives Considered

### Implement in TypeScript

TypeScript would fit the existing monorepo, but the requested direction is MoonBit and future wasm/JS binding support. MoonBit also keeps the discovery model separate from the existing task runner code.

### Put Discovery in Agent Task Loop Core

Embedding discovery directly in the existing CLI would be faster initially, but it would couple host inventory to task execution. A separate package keeps the boundary clear: inventory provider only, no scheduling.

### Parse Config Files for Richer Signals

Parsing config files could improve detection quality, especially for MCP configuration and editor extensions. It also increases privacy risk and schema churn. The first version only checks path existence.

### Treat Any `gh` Install as Runnable Copilot CLI

`gh` alone does not prove Copilot CLI support. The design marks GitHub Copilot CLI as `runnable` only when the relevant version probe succeeds; otherwise it is `found` with a warning.

## Testing Strategy

Core tests should cover:

- stable schema fields and `schema_version`
- path expansion and config path detection
- command versus app detection
- explicit JSON null serialization
- doctor summary counts and warnings

CLI validation should cover:

- `scan --json` emits valid JSON
- output includes all 10 agent IDs
- `scan` human output runs successfully
- `doctor` runs successfully

Repository validation should continue to run:

```bash
pnpm test
pnpm build
npm pack --dry-run --registry=https://registry.npmjs.org
```

## Rollout Plan

1. Add the MoonBit module and core scanner tests.
2. Implement core models, agent specs, scanner status derivation, JSON serialization, and doctor summaries.
3. Add the JS-target CLI probes and human-readable output.
4. Add the local `agent-finder` wrapper.
5. Wire MoonBit test and build commands into root validation scripts.
6. Validate JSON output and repository gates.
7. In a later change, decide how Agent Task Loop should consume the inventory output.

## Risks

- Agent command names and config paths can change over time.
- Some version commands may be slow or unavailable; the CLI must keep short timeouts and tolerate missing versions.
- Editor extension detection is intentionally conservative in the first version.
- Linux and Windows may require different app path and config path conventions.
- A future npm wrapper needs packaging decisions that this RFC does not settle.

## Open Questions

- Should `agent-finder` become a separately published npm package or stay internal to the monorepo first?
- Should future versions include an explicit `evidence` field explaining why each status was assigned?
- Should config paths include an `exists` boolean per path, or should the scanner continue reporting candidate paths only?
- How should Agent Task Loop cache or refresh discovery results when it starts a task?
