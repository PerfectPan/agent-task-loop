# RFC 0003: Global Config and Init Command

## Status

Proposed

## Summary

Add a global config file at `~/.agent-task-loop/config.json` and an `init` command that creates it from a template. Extend config resolution to fall back to the global config when no project config is found, and add `task.config.json` as a supported project config format alongside the existing TypeScript formats.

## Motivation

`agent-task-loop` currently requires a `task.config.ts` file in the project directory, or an explicit `--config` flag / `AGENT_TASK_LOOP_CONFIG` env var. This works but creates friction:

- Users must understand config placement before running any command.
- Configuration is tightly coupled to individual repositories with no cross-project sharing.
- There is no guided first-run experience; a missing config produces a bare error listing candidate paths.
- Reusable defaults such as agent definitions and workspace roots cannot be shared across projects.

The result is a "project-first" experience. An `init` command and a global config path turn it into a "user-first" experience where the tool works out of the box once configured globally, with project configs used only for overrides.

## Goals

- Support a global config file at `~/.agent-task-loop/config.json`.
- Resolve the global config as a fallback when no project config or env var is found.
- Support `task.config.json` as a project config format alongside the existing TypeScript and JavaScript formats.
- Add an `init` command that guides users through first-run setup interactively: detect whether `lark-cli` is installed, print installation instructions if it is missing, use `@rivus/agent-finder-core` to discover which supported coding agents are available on the machine, prompt for Feishu `baseToken` and `tableId`, and write `~/.agent-task-loop/config.json` with the discovered agents pre-populated.
- Improve the "no config found" error message to mention `init`.
- Keep the config resolution order deterministic and easy to reason about.

## Non-Goals

- Deep or implicit merging of global and project configs. The first config found wins entirely.
- Migrating existing `task.config.ts` files.
- Changing the Zod schema for `AppConfig`.
- Supporting additional global config formats (TOML, YAML, etc.).

## Proposed Design

### Config Resolution Order

The CLI resolves config in the following order (first match wins):

1. `--config` flag (explicit path, resolved from cwd).
2. `AGENT_TASK_LOOP_CONFIG` env var (resolved from cwd).
3. Walk up from cwd, checking each directory for (in order):
   - `task.config.ts`
   - `task.config.mts`
   - `task.config.js`
   - `task.config.mjs`
   - `task.config.json`
4. Global config: `~/.agent-task-loop/config.json`.

Notes:

- The global config is always JSON; no TypeScript runtime is required to read it.
- Project configs can be TypeScript, JavaScript, or JSON.
- The first file found at any layer wins. There is no merging between layers.

### Global Config

**Path:** `~/.agent-task-loop/config.json`

**Format:** JSON, matching the existing `AppConfig` Zod schema.

**Loading:** Read with `fs.readFileSync` + `JSON.parse`, then validated with `appConfigSchema.parse`. This avoids the need for a dynamic `import()` and eliminates the TypeScript runtime dependency for the global case.

### `task.config.json` Project Config

Project configs in JSON format are loaded the same way as the global config (via `readFileSync` + `JSON.parse`). TypeScript and JavaScript project configs continue to use dynamic `import()` via `pathToFileURL`.

### `init` Command

```
agent-task-loop init
```

Behavior:

1. **Detect `lark-cli`**: resolve `lark-cli` on `PATH` using Node's `child_process`. If not found, print installation instructions and exit with a non-zero code:

   ```
   lark-cli is required but not found on PATH.
   Install it and re-run `agent-task-loop init`.
   ```

2. **Check existing config**: compute `~/.agent-task-loop/config.json`. If it already exists, print its path and exit without modifying it.

3. **Discover available agents**: call `collectHostProbe()` + `discover()` from `@rivus/agent-finder-core` (a sibling package in this monorepo). Filter the `DiscoveryReport` to agents that are both supported by `agent-task-loop` and have `status: 'runnable'`. The mapping from agent-finder provider IDs to `agent-task-loop` agent names is:

   | agent-finder ID | agent-task-loop name | command |
   |-----------------|----------------------|---------|
   | `claude-code`   | `claude`             | `claude` |
   | `codex`         | `codex`              | `codex`  |
   | `coco`          | `coco`               | `coco`   |
   | `glm`           | `glm`                | `glm`    |

   > **Note:** `coco` and `glm` are not yet in the agent-finder catalog. They must be added to `packages/agent-finder/agent_discovery_core/catalog/providers.mbt` as part of this RFC's implementation before `init` can discover them.

   Print which agents were found:

   ```
   Found agents: claude, codex
   ```

4. **Interactive prompts**: use Node's built-in `readline` to prompt:

   ```
   Feishu base token: _
   Feishu table ID: _
   ```

5. **Write config**: create `~/.agent-task-loop/` if needed, then write `config.json` with the provided Feishu values and the discovered agents pre-populated:

   ```json
   {
     "feishu": {
       "baseToken": "<entered value>",
       "tableId": "<entered value>"
     },
     "projects": {},
     "repositories": {},
     "agents": {
       "claude": { "name": "claude", "command": "claude", "args": [], "env": {} },
       "codex":  { "name": "codex",  "command": "codex",  "args": [], "env": {} }
     }
   }
   ```

   If no supported agents are found, write an empty `agents` object and print a warning.

6. Print the config path and confirm setup is complete.

Validation against `appConfigSchema` is skipped during `init` because `projects` and `repositories` are intentionally empty — they are populated as users configure their first project. Live commands validate the config when they load it.

### Dependency Change

`packages/agent-task-loop/package.json` must add `@rivus/agent-finder-core` as a workspace dependency:

```json
"@rivus/agent-finder-core": "workspace:*"
```

### Error Message Improvement

When `resolveConfigPath` finds no config at any layer, the error changes from:

> No task config found. Looked for: …

to:

> No task config found. Run `agent-task-loop init` to create a global config, or pass --config / set AGENT_TASK_LOOP_CONFIG.

## Alternatives Considered

### Deep Merge of Global and Project Configs

Merging would let users set global defaults and override per project. It adds complexity: field-level precedence rules, potential for surprising behavior when partial project configs override global sections. The design principle "minimal merging" from the issue rules this out. The first-found config wins.

### Keep Global Config as TypeScript

Using `task.config.ts` as the global format would be consistent with the existing project format, but it requires `tsx` or a similar runtime, which is not always available on a bare install. JSON is simpler and has no runtime dependency.

### Non-Interactive `init` (write template only)

Writing a template file without prompts avoids any readline dependency, but it leaves users with placeholder values they must locate and replace manually. Given that `lark-cli` and a real Feishu base token are both hard requirements before any command works, guiding users through those two inputs at `init` time is a better first-run experience.

### Support `~/.config/agent-task-loop/config.json` (XDG)

XDG-style paths are more portable on Linux, but they add platform-specific logic and a config path discovery layer. The `~/.agent-task-loop/` convention is straightforward, matches the tool name, and is consistent across macOS, Linux, and Windows.

## Testing Strategy

- **`load-config.test.ts`**: add cases for `task.config.json` discovery in a temp dir, global config fallback when no project config exists, and project config taking precedence over global config.
- **`init.test.ts`**: cover config write with discovered agents in a fake home directory, idempotent behavior when config already exists, and lark-cli-missing exit path (by stubbing the resolver).
- All existing tests must continue to pass without changes.
- Run `pnpm test` and `pnpm build` in `packages/agent-task-loop` before merging.

## Rollout Plan

1. Add `coco` and `glm` provider specs to `packages/agent-finder/agent_discovery_core/catalog/providers.mbt`.
2. Update `resolveConfigPath` in `load-config.ts`: add `task.config.json` to the walk-up candidates and add the global config path as the final fallback.
3. Update `loadConfig` in `load-config.ts`: route JSON paths to `readFileSync` + `JSON.parse` instead of dynamic `import()`.
4. Update the "no config found" error message to mention `init`.
5. Add tests for JSON project config and global config fallback.
6. Add `@rivus/agent-finder-core: workspace:*` to `packages/agent-task-loop/package.json` dependencies.
7. Implement `src/commands/init.ts`: `lark-cli` detection, agent discovery via `@rivus/agent-finder-core`, `readline` prompts, config write.
8. Add tests for `init` core logic (excluding interactive readline layer).
9. Register `initCommand` in `cli.ts`.
10. Verify with `pnpm test`, `pnpm build`, and `npm pack --dry-run` in `packages/agent-task-loop`.

## Risks

- `os.homedir()` is called at resolution time, not at module load time, so tests can redirect it by mutating the `os` module export. If this assumption breaks under a future Node.js version, the global config path lookup must be extracted into a helper that tests can stub differently.
- JSON project configs give up TypeScript's ability to compute values dynamically (e.g. constructing a command from `process.env`). Users who need dynamic values must use a TypeScript config.
- The `init` command's `readline` prompts cannot be tested with the standard Vitest runner without piping stdin. Tests for `init` should extract `createGlobalConfig(inputs)` as a pure function that accepts pre-collected values, and test the interactive prompt layer separately or not at all.
- `coco` and `glm` are currently absent from the agent-finder catalog. Until they are added (step 1 of the rollout), `init` cannot discover them and will silently omit them from the generated config.

## Decisions

- Global config is JSON-only, loaded via `readFileSync`.
- `task.config.json` is supported as a project config format.
- Resolution is first-match-wins with no merging.
- `init` detects `lark-cli`, uses `@rivus/agent-finder-core` to discover supported agents, prompts for Feishu credentials, and writes the config with agents pre-populated.
- `coco` and `glm` provider specs must be added to the agent-finder catalog before they can be auto-discovered.
