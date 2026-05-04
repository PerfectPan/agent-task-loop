# agent-finder

Read-only local code agent discovery for Agent Task Loop and JavaScript consumers.

This package is the MoonBit provider core for RFC 0002. It models supported coding-agent providers, evaluates host probe facts, derives stable discovery statuses, records evidence for each status, and emits JSON with `schema_version: "0.1"`.

## Structure

- `agent_discovery_core/types.mbt`: public data model and JSON encoding.
- `agent_discovery_core/providers.mbt`: provider matrix and provider constructors.
- `agent_discovery_core/scan.mbt`: deterministic scan and status derivation.
- `agent_discovery_core/doctor.mbt`: diagnostics derived from scan output.
- `agent_discovery_core/known_*.mbt`: stable provider, command, and path candidate lists.
- `agent_discovery_core/expand_path.mbt`: path expansion helper owned by the MoonBit domain package.
- `agent_discovery_core/*_json.mbt`: JSON bridge functions exported to the MoonBit JavaScript backend.
- `src/`: npm-facing TypeScript wrapper used by JavaScript consumers and the CLI.

## JavaScript Wrapper Boundary

`@rivus/agent-finder-core` is the npm wrapper package. It builds the MoonBit package with `moon build --target js`, copies the generated bridge into `src/moonbit/`, and exposes JS-friendly functions from `src/index.ts`.

The MoonBit package owns the domain model: provider definitions, stable statuses, evidence semantics, scan rules, diagnostics, and the versioned JSON contract. The TypeScript wrapper owns npm ergonomics and host interaction: PATH lookup, executable checks, path existence checks, bounded version probes, type mapping, and CLI-friendly exports.

The CLI depends only on `@rivus/agent-finder-core`. It does not call MoonBit directly and does not duplicate discovery rules.

## Boundary

The core does not touch the host. Callers provide a `Probe` containing command, path, executable, and version facts. The scanner does not execute tasks, start agent sessions, submit prompts, upload inventory data, parse tokens, or read config file contents.

## Publishing

The MoonBit module metadata lives in `moon.mod.json`. Publishing to mooncakes.io is manual until release ownership and credentials are explicitly confirmed.

Manual publish outline:

```bash
moon register
moon login
moon publish
```

Published updates should use SemVer version bumps.
