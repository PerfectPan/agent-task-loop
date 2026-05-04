# Agent Finder Provider Implementation Plan

## Status

Draft

## Context

RFC 0002 is accepted. The implementation should add `agent-finder` as a read-only provider inventory utility with:

- a MoonBit provider core
- a JavaScript wrapper package for JS consumers
- a JavaScript CLI
- first-class macOS, Linux, and Windows fixtures
- provider-oriented commands such as `provider -h`, `provider list`, and `provider inspect <id>`

The implementation must stay within the RFC privacy boundary: no task execution, no prompt submission, no uploads, no token parsing, and no config content parsing.

## Target Shape

### Package Layout

- `packages/agent-finder/moon.mod.json`
- `packages/agent-finder/agent_discovery_core/`
- `packages/agent-finder/package.json`
- `packages/agent-finder/src/`
- `packages/agent-finder/bin/agent-finder.mjs`
- `packages/agent-finder/README.mbt.md`

### Package Names

- MoonBit module: `nyx/agent-finder` or another mooncakes.io-compatible module name chosen before publish.
- npm core wrapper package: `@rivus/agent-finder-core`.
- npm CLI package: `@rivus/agent-finder-cli`.
- CLI binary: `agent-finder`.

The npm packages should be public, ESM-first, Node >=20, and published under the existing `@rivus` scope. The core package should be consumable without installing the CLI package.

### Public Surfaces

- MoonBit core:
  - provider specs
  - probe input records
  - discovery report records
  - status derivation
  - evidence records
  - doctor summary
  - explicit JSON serialization
- JavaScript wrapper:
  - load provider specs
  - collect host probe facts
  - run discovery
  - expose npm-friendly functions
- CLI:
  - `agent-finder scan`
  - `agent-finder scan --json`
  - `agent-finder provider -h`
  - `agent-finder provider list`
  - `agent-finder provider inspect <id>`
  - `agent-finder doctor`

## Provider Matrix

Initial provider IDs should cover the RFC support matrix:

- `opencode`
- `openhands`
- `claude-code`
- `cline`
- `codebuddy`
- `codex`
- `command-code`
- `kiro-cli`
- `cursor`
- `antigravity`
- `roo-code`
- `github-copilot`
- `amp`
- `openclaw`
- `neovate`
- `pi`
- `qoder`
- `zencoder`
- `kimi-code-cli`
- `gemini-cli`
- `windsurf`
- `vscode-copilot`
- `codex-desktop`
- `aider`
- `hermes`
- `trae`

Provider support can start with conservative command, app path, config path, and MCP path candidates. If a provider's exact paths are uncertain, include the provider spec with limited evidence and warnings rather than inventing unsafe probes.

## Provider Adapter Model

Each provider should have an adapter spec, not custom scanner control flow. The adapter is data-first and may include small probe hooks only when a provider cannot be represented with common command/path/version metadata.

Adapter fields:

- `id`
- `display_name`
- `kind`
- `command_candidates`
- `app_path_candidates`
- `config_path_candidates`
- `mcp_config_path_candidates`
- `version_probe`
- `platform_overrides`
- `evidence_rules`
- `warnings`

Adapter modes:

- `metadata`: command, app path, config path, and MCP path checks only.
- `versioned-cli`: metadata checks plus a bounded read-only version probe.
- `app-only`: app path and config path checks for products without a stable CLI.
- `extension`: conservative editor extension signals without reading full extension metadata.

The scanner should evaluate adapter specs through shared code. Provider-specific logic should be exceptional, isolated, and covered by fixture tests.

## Implementation Phases

### Phase 1: Core Data Model

Files:

- `packages/agent-finder/moon.mod.json`
- `packages/agent-finder/agent_discovery_core/moon.pkg`
- `packages/agent-finder/agent_discovery_core/discovery.mbt`
- `packages/agent-finder/agent_discovery_core/discovery_test.mbt`

Tasks:

- Define `HostInfo`, `ProviderSpec`, `Probe`, `AgentRecord`, `Evidence`, `DiscoveryReport`, and `DoctorSummary`.
- Define status semantics: `runnable`, `found`, `missing`, `unknown`.
- Implement deterministic scanner from `Probe` to `DiscoveryReport`.
- Implement explicit JSON serialization for nullable fields and arrays.
- Add fixtures for macOS, Linux, and Windows.
- Define adapter modes and provider spec validation.

Acceptance:

- Core tests cover status derivation, evidence, JSON nulls, provider IDs, and doctor counts.
- The scanner never touches the host directly.
- Provider specs validate without duplicate IDs or unsupported adapter modes.

### Phase 1.5: MoonBit Publishing Preparation

Files:

- `packages/agent-finder/moon.mod.json`
- `packages/agent-finder/README.mbt.md`

Tasks:

- Use `nyx/agent-finder` as the mooncakes.io module name unless ownership changes before first publish.
- Fill module metadata: version, license, keywords, repository, description, and homepage.
- Keep MoonBit package names aligned with directory names because MoonBit package identity is directory-derived.
- Document and wire the publish path:
  - `moon package` as the CI packaging preflight.
  - `moon check --target all` and `moon test --target all` in MoonBit release CI.
  - `moon publish` from a dedicated GitHub Release workflow.
  - SemVer version bumps in `moon.mod.json` for every published module update.

Acceptance:

- `moon.mod.json` contains publish-ready metadata.
- Release CI publishes the MoonBit module when `MOONCAKES_NYX_TOKEN` is configured.

### Phase 2: Provider Specs

Files:

- `packages/agent-finder/agent_discovery_core/discovery.mbt`
- `packages/agent-finder/agent_discovery_core/discovery_test.mbt`

Tasks:

- Add data-driven provider specs for the initial provider matrix.
- For each provider, define:
  - ID
  - display name
  - type
  - command candidates
  - app path candidates
  - config path candidates
  - MCP config path candidates
  - version probe strategy when known
- Add warnings for providers with intentionally incomplete path knowledge.

Acceptance:

- `known_provider_specs()` returns stable provider IDs in deterministic order.
- Fixture tests assert all initial provider IDs are present.

### Phase 3: JavaScript Wrapper

Files:

- `packages/agent-finder/package.json`
- `packages/agent-finder/src/index.ts`
- `packages/agent-finder/src/probes/`
- `packages/agent-finder/src/providers/`

Tasks:

- Create `@rivus/agent-finder-core`.
- Add platform-aware PATH resolution.
- Support Windows executable extensions without shelling through user-controlled strings.
- Use read-only `fs.existsSync` and bounded `execFileSync` calls with fixed argument arrays.
- Convert host facts into core `Probe` input.
- Export JS functions for discovery, provider listing, provider inspection, and fixture-based tests.
- Keep CLI-only dependencies out of the core wrapper package.

Acceptance:

- Wrapper tests or CLI smoke tests cover macOS, Linux, and Windows fixture paths.
- Version probes are bounded and failure-tolerant.
- `@rivus/agent-finder-core` can be imported without invoking CLI code.

### Phase 4: CLI

Files:

- `packages/agent-finder-cli/package.json`
- `packages/agent-finder-cli/src/cli.ts`
- `packages/agent-finder/bin/agent-finder.mjs`
- `packages/agent-finder/README.mbt.md`

Tasks:

- Create `@rivus/agent-finder-cli`.
- Use `citty` for the CLI framework unless implementation research finds a blocker.
- Implement scan table output.
- Implement `scan --json`.
- Implement `provider -h`.
- Implement `provider list`.
- Implement `provider inspect <id>`.
- Implement `doctor`.
- Document command examples and privacy boundary.

CLI framework rationale:

- `citty` is already used by `@rivus/agent-task-loop`, supports nested subcommands, async commands, and generated help.
- `commander` is a strong fallback for small standalone CLIs.
- `yargs` is a fallback if command middleware or richer validation becomes more important than keeping the dependency surface small.
- `oclif` is not the first choice because plugin-oriented enterprise CLI scaffolding is heavier than this package needs.

Acceptance:

- CLI exits non-zero for unknown commands and unknown provider IDs.
- `provider inspect <id>` shows provider metadata without reading config contents.
- Human output is stable enough for users but JSON remains the compatibility contract.
- `agent-finder provider -h` is the baseline help experience.

### Phase 5: Repository Wiring

Files:

- `package.json`
- `.gitignore` if needed
- package README and packaging metadata if introduced

Tasks:

- Add `agent-finder` local script if useful.
- Wire MoonBit tests into `pnpm test`.
- Wire MoonBit default and JS-target builds into `pnpm build`.
- Add npm workspace/package wiring for `@rivus/agent-finder-core` and `@rivus/agent-finder-cli`.
- Keep package contents public-safe.

Acceptance:

- Root validation runs the MoonBit package.
- Package dry-run output contains only intended files.
- `npm pack --dry-run --registry=https://registry.npmjs.org` is run from each publishable npm package directory.

## Validation Commands

Run before claiming implementation complete:

```bash
corepack pnpm test
corepack pnpm build
npm pack --dry-run --registry=https://registry.npmjs.org
rg --hidden --no-ignore -n "internal-domain.example|/Users/|private-token|secret" . \
  --glob '!node_modules/**' \
  --glob '!packages/agent-task-loop/node_modules/**' \
  --glob '!.git/**' \
  --glob '!.omx/**'
```

Additional CLI checks:

```bash
node packages/agent-finder/bin/agent-finder.mjs scan
node packages/agent-finder/bin/agent-finder.mjs scan --json
node packages/agent-finder/bin/agent-finder.mjs provider -h
node packages/agent-finder/bin/agent-finder.mjs provider list
node packages/agent-finder/bin/agent-finder.mjs provider inspect codex
node packages/agent-finder/bin/agent-finder.mjs doctor
```

## PR Strategy

Use one draft implementation PR unless the first implementation becomes too large. If splitting is needed, split by dependency order:

1. MoonBit core and provider specs
2. JavaScript wrapper and CLI
3. repository wiring and documentation

Each PR should link RFC 0002 and issue #6.

## Risks and Guardrails

- Provider metadata may be incomplete. Prefer explicit warnings over overconfident detection.
- Cross-platform executable semantics differ. Keep host probes in the JS wrapper and keep the MoonBit core deterministic.
- Version probes may hang or open interactive flows. Keep probes bounded, read-only, and failure-tolerant.
- Discovery should not become assignment. Agent Task Loop integration must check inventory before assigning work, but this package stays an inventory provider.
