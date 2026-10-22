# Agent Discovery

Agent discovery is the read-only inventory of the coding agents installed on
the current host. It is not a scheduler, runner, terminal multiplexer, API
proxy, or credential reader. The CLI surface is
[`packages/agent-finder-cli/README.md`](../../packages/agent-finder-cli/README.md);
publishing is in [`../npm-publish.md`](../npm-publish.md).

## Layers

| Layer                             | Where                       | Owns                                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kit detection `@rivus/agent-kit`  | npm                         | `builtinProviders` discovery services and `detectAgents` for its 7 agents (claude-code, codex, cursor, gemini-cli, grok, opencode, pi): PATH lookup, path checks, version probes, file-based login state, evidence and status classification |
| Legacy recipes `agent-finder-cli` | `src/discovery/`            | One probe recipe per MoonBit-catalog agent the kit does not cover (20 agents): the ported command, app, config and MCP paths, `--version` probes, and the original warnings                                                                  |
| CLI `@rivus/agent-finder-cli`     | `packages/agent-finder-cli` | Argument parsing and human output: `scan`, `scan --json`, `provider -h`, `provider list`, `provider inspect <id>`, `doctor`, and the session browser                                                                                         |

`detectAgents` checks paths through a platform port, so fixtures run against an
in-memory platform (`@rivus/agent-kit/testing`'s `createMemoryPlatform`) and
CI needs no toolchain beyond Node. `agent-task-loop init` calls the same
`detectAgents` with `versionProbe: false` for claude-code and codex, so
configuration never executes an agent command.

## Status and evidence

| Status     | Meaning                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| `runnable` | A version probe ran the agent's command and it printed a version                            |
| `found`    | A command, app, config, or MCP config path exists, but runnable CLI execution is not proven |
| `missing`  | Every check completed and found nothing                                                     |
| `unknown`  | A check failed (reported in `problems`), so absence is not proven                           |

Every installation carries an `evidence` array explaining its status, so a
consumer can tell "runnable because the version probe succeeded" from "found
because a config directory exists". `scan --json` prints that installation
array; `auth` reports the file-based login state and `problems` the checks that
could not complete.

## Privacy boundary

A scan is local: no uploads, no API calls, no agent sessions, no prompts. It
checks whether known paths exist and runs conventional read-only `--version`
probes with fixed argument arrays and a time limit. Unlike the MoonBit scanner
it replaced, file-based login detection reads credential files the recipes
name (for example `~/.codex/auth.json`) and keeps only non-secret facts such as
whether a credential is stored. Callers that must not execute agent commands
pass `versionProbe: false`, as `agent-task-loop init` does; no detection mode
starts a login.

## Consumers

- `agent-task-loop init` runs detection and pre-fills `claude` and `codex`
  agent entries from commands found on `PATH`.
- `apps/room-web` does not use the CLI; it asks each agent binding
  directly through an ACP probe (see [agent-collaboration.md](agent-collaboration.md)).
- Task start does not consult discovery: a missing or broken target agent
  command fails only when its process starts, after the Task was claimed and
  moved to 执行中. A pre-claim check is tracked in
  [#156](https://github.com/PerfectPan/agent-task-loop/issues/156).

## Build pipeline

All TypeScript packages build with `vp pack` (Vite+), ESM only. Each package
owns its `vite.config.ts`; there is no shared build-config package. The
configs pin plain `.js`/`.d.ts` output names (`fixedExtension: false` or
`outExtensions`) so the `exports` and `bin` paths in `package.json` keep
resolving.
