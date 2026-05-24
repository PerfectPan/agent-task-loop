# @rivus/agent-task-loop

## 0.3.0

### Minor Changes

- 4efb151: Add `--json` flag to `sync`, `schema`, `cleanup`, and `complete` commands for machine-readable output.

## 0.2.0

### Minor Changes

- d06ddb2: Add global config fallback and `init` command.

  - `task.config.json` is now a supported project config format alongside TypeScript/JavaScript configs.
  - Config resolution falls back to `~/.agent-task-loop/config.json` when no project config is found.
  - New `init` command detects `lark-cli` (and offers to install it), discovers available coding agents via `@rivus/agent-finder-core`, prompts for Feishu credentials, and writes the global config.
  - "No config found" error now mentions `agent-task-loop init`.

## 0.1.1

### Patch Changes

- 4272fb1: Replace tsup with rslib for all packages. Eliminate scripts/sync-moonbit-js.mjs by embedding MoonBit FFI sync into an rslib plugin. Add shared @rivus/rslib-config package.

## 0.1.0

### Minor Changes

- 5d9d80b: Initial public release of the Agent Task Loop CLI.
