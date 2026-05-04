# agent-finder

Read-only local code agent discovery for Agent Task Loop and JavaScript consumers.

This package is the MoonBit provider core for RFC 0002. It models supported coding-agent providers, evaluates host probe facts, derives stable discovery statuses, records evidence for each status, and emits JSON with `schema_version: "0.1"`.

## Structure

- `agent_discovery_core/types.mbt`: public data model and JSON encoding.
- `agent_discovery_core/providers.mbt`: provider matrix and provider constructors.
- `agent_discovery_core/discovery.mbt`: deterministic scan, status derivation, diagnostics, and path helpers.
- `src/`: npm-facing TypeScript wrapper used by JavaScript consumers and the CLI.

## JavaScript Wrapper Boundary

The MoonBit package owns the domain model: provider definitions, stable statuses, evidence semantics, and the versioned JSON contract. The TypeScript wrapper owns host interaction for npm consumers: PATH lookup, executable checks, path existence checks, bounded version probes, and CLI-friendly exports.

The current wrapper keeps a TypeScript mirror of the provider matrix and scan semantics so the npm package can run without requiring generated MoonBit JavaScript artifacts at runtime. The wrapper tests lock the public contract against the same provider IDs, status semantics, evidence fields, and `schema_version: "0.1"` output as the MoonBit core. When MoonBit JS artifacts become a stable runtime dependency for this package, the wrapper boundary can narrow to host probe collection plus direct calls into the generated core.

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
