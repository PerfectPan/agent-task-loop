# agent-finder

Read-only local code agent discovery for Agent Task Loop and JavaScript consumers.

This package is the MoonBit provider core for RFC 0002. It models supported coding-agent providers, evaluates host probe facts, derives stable discovery statuses, records evidence for each status, and emits JSON with `schema_version: "0.1"`.

## Structure

- `agent_discovery_core/model/`: public data model and JSON encoding.
- `agent_discovery_core/catalog/`: provider matrix, provider constructors, and stable candidate lists.
- `agent_discovery_core/scanner/`: deterministic scan, status derivation, evidence, and path helpers.
- `agent_discovery_core/diagnostics/`: diagnostics derived from scan output.
- `agent_discovery_core/js_abi.mbt`: minimal JSON ABI exported by the MoonBit JavaScript backend.
- `src/`: npm-facing TypeScript wrapper used by JavaScript consumers and the CLI.

## JavaScript Wrapper Boundary

`@rivus/agent-finder-core` is the npm wrapper package. It builds the MoonBit package with `moon build --target js`, copies the generated JavaScript backend output into `src/moonbit/`, and exposes JS-friendly functions from `src/index.ts`.

The MoonBit package owns the domain model: provider definitions, stable statuses, evidence semantics, scan rules, diagnostics, and the versioned JSON contract. The TypeScript wrapper owns npm ergonomics and host interaction: PATH lookup, executable checks, path existence checks, bounded version probes, type mapping, and CLI-friendly exports.

The CLI depends only on `@rivus/agent-finder-core`. It does not call MoonBit directly and does not duplicate discovery rules.

## Boundary

The core does not touch the host. Callers provide a `Probe` containing command, path, executable, and version facts. The scanner does not execute tasks, start agent sessions, submit prompts, upload inventory data, parse tokens, or read config file contents.

## Publishing

The MoonBit module metadata lives in `moon.mod.json`. The module name is `nyx/agent-finder`, which must match the authenticated mooncakes.io username.

CI always packages the module with:

```bash
moon -C packages/agent-finder package
```

Release CI publishes to mooncakes.io from the dedicated MoonBit publish workflow when the `MOONCAKES_NYX_TOKEN` GitHub Actions secret is configured. See `docs/moonbit-publish.md` for the release flow.

Manual publish outline:

```bash
moon login
moon publish
```

Published updates should use SemVer version bumps.
