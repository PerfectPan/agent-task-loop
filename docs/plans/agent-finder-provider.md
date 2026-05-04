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
- `packages/agent-finder/js/`
- `packages/agent-finder/bin/agent-finder.mjs`
- `packages/agent-finder/README.mbt.md`

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

Acceptance:

- Core tests cover status derivation, evidence, JSON nulls, provider IDs, and doctor counts.
- The scanner never touches the host directly.

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

- `packages/agent-finder/js/`
- `packages/agent-finder/bin/agent-finder.mjs`

Tasks:

- Add platform-aware PATH resolution.
- Support Windows executable extensions without shelling through user-controlled strings.
- Use read-only `fs.existsSync` and bounded `execFileSync` calls with fixed argument arrays.
- Convert host facts into core `Probe` input.
- Export JS functions for discovery and provider inspection.

Acceptance:

- Wrapper tests or CLI smoke tests cover macOS, Linux, and Windows fixture paths.
- Version probes are bounded and failure-tolerant.

### Phase 4: CLI

Files:

- `packages/agent-finder/bin/agent-finder.mjs`
- `packages/agent-finder/README.mbt.md`

Tasks:

- Implement scan table output.
- Implement `scan --json`.
- Implement `provider -h`.
- Implement `provider list`.
- Implement `provider inspect <id>`.
- Implement `doctor`.
- Document command examples and privacy boundary.

Acceptance:

- CLI exits non-zero for unknown commands and unknown provider IDs.
- `provider inspect <id>` shows provider metadata without reading config contents.
- Human output is stable enough for users but JSON remains the compatibility contract.

### Phase 5: Repository Wiring

Files:

- `package.json`
- `.gitignore` if needed
- package README and packaging metadata if introduced

Tasks:

- Add `agent-finder` local script if useful.
- Wire MoonBit tests into `pnpm test`.
- Wire MoonBit default and JS-target builds into `pnpm build`.
- Keep package contents public-safe.

Acceptance:

- Root validation runs the MoonBit package.
- Package dry-run output contains only intended files.

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
