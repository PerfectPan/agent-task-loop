# Agent Discovery and the MoonBit Build

`packages/agent-finder` is a read-only inventory of the coding agents installed
on the current host. It is not a scheduler, runner, terminal multiplexer, API
proxy, or credential reader. Package-level usage is in
[`packages/agent-finder/README.md`](../../packages/agent-finder/README.md);
publishing is in [`../moonbit-publish.md`](../moonbit-publish.md) and
[`../npm-publish.md`](../npm-publish.md).

## Layers

| Layer | Where | Owns |
| --- | --- | --- |
| MoonBit core `PerfectPan/agent-finder` | `agent_discovery_core/` | Provider catalog, status derivation, evidence, diagnostics, versioned JSON |
| npm wrapper `@rivus/agent-finder-core` | `src/` | Host probes (PATH lookup, executable and path checks, bounded version probes), type mapping, JS exports |
| CLI `@rivus/agent-finder-cli` | `packages/agent-finder-cli` | Argument parsing and human output: `scan`, `scan --json`, `provider -h`, `provider list`, `provider inspect <id>`, `doctor`, and the session browser |

The core scanner never touches the host. It receives a `Probe` of facts
collected by the wrapper, which keeps it deterministic and testable across
macOS, Linux, and Windows fixtures. The catalog is data-driven:
`known_provider_specs()`, `known_command_candidates()`, and
`known_path_candidates()` are the single source the wrapper probes from.

## Status and evidence

| Status | Meaning |
| --- | --- |
| `runnable` | A command exists and is executable; where a provider needs an extension subcommand (for example GitHub Copilot through `gh`), its version probe also succeeded |
| `found` | An app, command, config, or MCP config path exists, but runnable CLI execution is not proven |
| `missing` | No known command, app, config, or MCP path was found |
| `unknown` | Reserved for probe failures that cannot be classified safely |

Every agent record carries an `evidence` array explaining its status, so a
consumer can tell "runnable because command and version probe succeeded" from
"found because a config directory exists". JSON output carries
`schema_version: "0.1"` and serializes absent optional strings as `null`.

## Privacy boundary

A scan is local and read-only: no uploads, no API calls, no token or config
content parsing, no agent sessions, no prompts. It checks only whether known
paths exist and runs conventional read-only `--version` probes with fixed
argument arrays and short timeouts.

## Consumers

- `agent-task-loop init` runs discovery and pre-fills `claude` and `codex`
  agent entries from `runnable` results.
- `apps/room-web` does not use this package; it asks each agent binding
  directly through an ACP probe (see [agent-collaboration.md](agent-collaboration.md)).
- Task assignment does not consult discovery yet; see
  [`docs/specs/0002-discovery-before-assignment.md`](../specs/0002-discovery-before-assignment.md).

## Build pipeline

All TypeScript packages build with rslib, ESM only, sharing configuration from
the private workspace package `@rivus/rslib-config`:

- `lib.config.ts` for libraries and `cli.config.ts` for CLIs.
- `moonbit-plugin.ts` for `@rivus/agent-finder-core`: before each build it
  syncs the MoonBit JavaScript backend output into `src/moonbit/` (gitignored),
  so TypeScript imports stay stable and no separate sync script exists.

Each package's `rslib.config.ts` is a thin extension of the shared base.
`pnpm test` runs the MoonBit tests (`moon -C packages/agent-finder test`)
alongside the JavaScript suites.
