# RFC 0002: Code Agent Discovery

## Status

Proposed

## Summary

Add `agent-finder`, a local read-only code agent inventory provider for Agent Task Loop and JavaScript consumers. It discovers common coding agents installed on the current machine and reports stable structured output that task assignment code can check before choosing an agent.

The tool is not a scheduler, runner, terminal multiplexer, API proxy, or credentials reader. It only checks commands, application paths, configuration path existence, MCP configuration path existence, and safe version commands.

## Motivation

Agent Task Loop already orchestrates work across coding agent workflows, but it has no stable local inventory of which agents are available on a developer machine. Without that inventory, higher-level workflows either need hard-coded assumptions or repeated ad hoc checks.

A dedicated discovery tool gives the project:

- a stable local source of truth for installed code agents
- a narrow privacy boundary for host scanning
- predictable JSON for JavaScript, wasm, and npm consumers
- a place to evolve agent-specific detection logic without coupling it to task execution

## Goals

- Implement the provider core in MoonBit.
- Publish the provider through a JavaScript wrapper package so the JS ecosystem can consume it as a utility package.
- Implement the CLI surface in JavaScript on top of the provider wrapper.
- Keep core models and APIs stable enough for JS bindings, wasm use, and direct Agent Task Loop integration.
- Support macOS, Linux, and Windows as first-class platforms.
- Maintain a read-only privacy boundary: do not read token contents, parse secrets, upload inventory data, start agent sessions, or submit prompts.
- Detect common code agents:
  - OpenCode
  - OpenHands
  - Claude Code
  - Cline
  - CodeBuddy
  - Codex
  - Command Code
  - Kiro CLI
  - Cursor
  - Antigravity
  - Roo Code
  - GitHub Copilot
  - Amp
  - OpenClaw
  - Neovate
  - Pi
  - Qoder
  - Zencoder
  - Kimi Code CLI
  - Gemini CLI
  - Windsurf
  - VS Code Copilot
  - Codex Desktop
  - aider
  - Hermes
  - Trae
- Report, per agent:
  - `id`
  - `name`
  - `type`
  - `status`
  - `command`
  - `app_path`
  - `version`
  - `evidence`
  - `config_paths`
  - `mcp_config_paths`
  - `warnings`
- Provide:
  - `agent-finder scan`
  - `agent-finder scan --json`
  - `agent-finder provider -h`
  - `agent-finder provider list`
  - `agent-finder provider inspect <id>`
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
- Prove editor extension installation by reading full extension metadata in the first version.

## Proposed Design

### Package Layout

Add a MoonBit provider module under `packages/agent-finder` and expose it through a JavaScript package:

- `agent_discovery_core`: scanning model, provider definitions, path expansion, status derivation, JSON serialization, and doctor summaries.
- JavaScript wrapper package: JS-friendly provider API, host probes, version command calls, and package entry points.
- JavaScript CLI: command-line parsing, provider help, scan output, doctor output, and human-readable formatting.

This mirrors the provider-oriented arrangement used by tools such as Vercel's `npx skills`, where agent support is represented as a registry/support matrix instead of hard-coded one-off command branches. `agent-finder` should keep provider definitions data-driven and start from the same broad support shape: OpenCode, OpenHands, Claude Code, Cline, CodeBuddy, Codex, Command Code, Kiro CLI, Cursor, Antigravity, Roo Code, GitHub Copilot, Amp, OpenClaw, Neovate, Pi, Qoder, Zencoder, Kimi Code CLI, and related coding-agent providers.

The repository root scripts should include the MoonBit package in normal validation:

- `pnpm test` also runs `moon test --manifest-path packages/agent-finder/moon.mod.json`.
- `pnpm build` also runs default and JS-target MoonBit builds.

### Core API

The core package exposes plain data records:

- `Probe`: all host facts supplied to the scanner.
- `HostInfo`: `os` and `arch`.
- `ProviderSpec`: one supported agent/provider definition.
- `AgentRecord`: one discovered provider result.
- `DiscoveryReport`: complete scan output.
- `DoctorSummary`: aggregate diagnostics.

The core scanner receives a `Probe` rather than touching the host directly. This keeps the core deterministic, testable, and suitable for JS bindings.

The core package also exposes candidate lists:

- `known_provider_specs()`
- `known_command_candidates()`
- `known_path_candidates()`

The JS wrapper and CLI use those lists to collect host facts without duplicating provider definitions.

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
      "evidence": [
        {
          "kind": "command",
          "value": "codex",
          "exists": true,
          "reason": "resolved on PATH"
        },
        {
          "kind": "version",
          "value": "codex --version",
          "exists": true,
          "reason": "version probe exited successfully"
        }
      ],
      "config_paths": ["~/.codex"],
      "mcp_config_paths": ["~/.codex/config.toml"],
      "warnings": []
    }
  ]
}
```

The core implements explicit JSON serialization for nullable string fields so consumers receive `null`, not MoonBit's derived option representation. `evidence` explains why a status was assigned, which lets Agent Task Loop distinguish "runnable because command and version probe succeeded" from "found only because a config directory exists".

### CLI Behavior

The CLI provides:

- `scan`: human-readable table with status, type, agent name, and command or app location.
- `scan --json`: stable machine-readable report.
- `provider -h`: provider-oriented help as the basic discovery experience.
- `provider list`: list supported provider IDs and display names.
- `provider inspect <id>`: show known commands, app paths, config paths, MCP paths, and version probe strategy for one provider without reading local config contents.
- `doctor`: aggregate counts, missing agents, and warnings.

The repository includes a JavaScript CLI entry at `packages/agent-finder/bin/agent-finder.mjs` so the local command shape is:

```bash
node packages/agent-finder/bin/agent-finder.mjs scan
node packages/agent-finder/bin/agent-finder.mjs scan --json
node packages/agent-finder/bin/agent-finder.mjs provider -h
node packages/agent-finder/bin/agent-finder.mjs provider list
node packages/agent-finder/bin/agent-finder.mjs provider inspect codex
node packages/agent-finder/bin/agent-finder.mjs doctor
```

### Host Probes

The JavaScript wrapper owns host interaction:

- command lookup through a platform-aware PATH resolver, avoiding shell-specific behavior and supporting Windows executable extensions
- filesystem existence checks through Node `fs.existsSync`
- executable checks through Node `fs.accessSync` with `X_OK` where the platform exposes POSIX execute bits, with Windows falling back to extension and spawnability checks
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

TypeScript would fit the existing monorepo and the CLI should be JavaScript-facing, but the provider core should stay in MoonBit. MoonBit keeps the discovery model separate from task runner code while still allowing a JS wrapper to provide npm-friendly ergonomics.

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
- output includes all supported provider IDs across macOS, Linux, and Windows fixtures
- `provider -h` runs successfully
- `provider list` includes supported provider IDs
- `provider inspect codex` shows provider metadata without reading config contents
- `scan` human output runs successfully
- `doctor` runs successfully

Repository validation should continue to run:

```bash
pnpm test
pnpm build
npm pack --dry-run --registry=https://registry.npmjs.org
```

## Rollout Plan

1. Add the MoonBit provider module and core scanner tests.
2. Implement core models, provider specs, scanner status derivation, JSON serialization, evidence records, and doctor summaries.
3. Add platform fixtures for macOS, Linux, and Windows before wiring assignment logic.
4. Add the JS wrapper package with platform-aware host probes and npm-friendly exports.
5. Add the JS CLI with scan, provider help/list/inspect, and doctor output.
6. Wire MoonBit test and build commands into root validation scripts.
7. Validate JSON output and repository gates.
8. Update Agent Task Loop assignment flow to run discovery checks before assigning a task to a provider.

## Risks

- Agent command names and config paths can change over time.
- Some version commands may be slow or unavailable; the CLI must keep short timeouts and tolerate missing versions.
- Editor extension detection is intentionally conservative in the first version.
- Cross-platform parity requires separate command, app path, config path, and executable semantics for macOS, Linux, and Windows.
- More providers increase maintenance cost because command names, app paths, and config paths drift independently.

## Decisions

- `agent-finder` should provide both a MoonBit provider package and a JavaScript wrapper package for the JS ecosystem.
- The CLI should be implemented in JavaScript on top of the wrapper package.
- Discovery output should include an explicit `evidence` array explaining why each status was assigned.
- Agent Task Loop should check discovery results before assigning work to a provider.

## Open Questions

- Should path evidence be represented only in `evidence`, or should `config_paths` and `mcp_config_paths` become arrays of objects with `path` and `exists` fields?
- Which provider probes need platform-specific names or install paths beyond the shared support matrix?
- How fresh must discovery results be before task assignment: every assignment, every process start, or a short TTL cache with manual refresh?
