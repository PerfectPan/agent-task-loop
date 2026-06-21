# RFC 0005: GitHub-Issues-Only Task Source + JSON Config

## Status

Proposed

## Summary

Two related changes that together let Agent Task Loop be run with **GitHub Issues as the sole task source** and a single, predictable config:

1. **Make Feishu optional.** Today `feishu` is a required config block and every live command asserts a real Feishu Base, so GitHub Issues only works as a *secondary* source. This RFC makes a config with only `githubIssues` (no `feishu`) valid and fully runnable.
2. **Simplify config to JSON-only, global-first.** Drop the implicit `task.config.{ts,js,…}` cwd walk-up and the package-root example fallback, and drop non-JSON config loading. Config is resolved from exactly three places, all JSON: `--config <file>` → `AGENT_TASK_LOOP_CONFIG` → `~/.agent-task-loop/config.json`.

The GitHub token is resolved from the `gh` CLI so `gh`-authenticated users need no token in config. Together this completes the remaining tail of #24 and lets the project be iterated through its own GitHub Issues.

## Motivation

The provider abstraction from #29 (`SourceProvider` / `CompositeTaskProvider`) is already source-agnostic. The only things forcing Feishu are: a required `feishu` schema block, `buildTaskProvider` always constructing a Feishu provider, and `assertFeishuRuntimeConfig` (9 callers) rejecting absent Feishu values.

Separately, config resolution today has five layers (explicit, env, cwd walk-up, package example, global) and loads `.ts`/`.js` via dynamic `import()`. That is more surface than this tool needs: config is machine/account-specific data (paths; no secrets — tokens come from the environment), so a single global JSON file plus an explicit override is clearer. The cwd walk-up is also a footgun ("why did a parent directory's file override mine?"), and `.ts` loading requires a TypeScript-capable runtime.

## Goals

- A config with `githubIssues` and no `feishu` is valid and runnable across all commands.
- Configs with only `feishu`, or both sources, keep working (no regression).
- At least one task source is required; neither → clear error.
- Config is **JSON only**, resolved from `--config` → `AGENT_TASK_LOOP_CONFIG` → `~/.agent-task-loop/config.json`.
- `init` lets the user pick the source(s) and writes the global JSON config.
- `gh`-authenticated users need no token in config.

## Non-Goals

- Changing `CompositeTaskProvider` internals (already source-agnostic).
- Changing the agent execution / review loop.
- Scaffolding `projects` / `repositories` interactively in `init` (still filled by the user).
- Supporting task sources other than Feishu and GitHub Issues.
- Supporting non-JSON config formats or per-directory config discovery.

## Proposed Design

### Config schema (`config/schema.ts`)

- Extract the Feishu shape into `feishuConfigSchema`; make the field optional: `feishu: feishuConfigSchema.optional()`.
- Keep `githubIssues` optional.
- Refine `appConfigSchema`: **at least one of `feishu` / `githubIssues`** must be present, else `"configure at least one task source: feishu or githubIssues"`.

### Config resolution & format (`config/load-config.ts`)

- `resolveConfigPath` resolves from exactly three places, in order:
  1. `--config <path>` (explicit; must exist)
  2. `AGENT_TASK_LOOP_CONFIG` env var
  3. `~/.agent-task-loop/config.json` (global)
  4. none → error: *"No config found. Run `agent-task-loop init`, or pass `--config` / set `AGENT_TASK_LOOP_CONFIG`."*
- **Removed**: the `task.config.*` cwd walk-up and the package-root example fallback.
- `loadConfigFromPath` parses **JSON only** (`JSON.parse`); the dynamic-`import()` path for `.ts`/`.js` is removed. No TypeScript runtime dependency.
- `task.config.example.ts` is replaced by **`config.example.json`** at the repo root — a documented example of the config shape (not auto-loaded).
- The `**/task.config.ts` entry in `.gitignore` is removed (obsolete; the global config lives outside any repo).

### Provider composition (`task-management/build-task-provider.ts`)

- Push `FeishuTaskProvider` only when `config.feishu` is present; push `GitHubIssuesTaskProvider` only when `config.githubIssues` is present.
- One source → return it directly; multiple → `CompositeTaskProvider`.
- `defaultSource` (for creates with no explicit source): Feishu when present, else GitHub.

### Runtime guard (`config/runtime-guard.ts`)

Rename `assertFeishuRuntimeConfig` → `assertRuntimeConfig(config)`: require ≥1 source; **only** when `config.feishu` is present, run the existing placeholder check. Update the 9 callers (`start`, `run`, `watch`, `resume`, `complete`, `reject`, `cleanup`, `tui`, `schema`).

### `schema` command (`commands/schema.ts`)

The `schema` command sets up Feishu Base fields. When `config.feishu` is absent, print a notice (*"No Feishu source configured; schema applies only to Feishu Base. GitHub Issues need no schema."*) and exit `0`.

### GitHub token resolution (`task-management/github-issues-task-provider.ts`)

Extend the fallback chain to reuse the `gh` CLI:

```
config.githubIssues.token  ??  process.env.GITHUB_TOKEN  ??  `gh auth token`
```

The `gh auth token` lookup runs once (cached), degrades to "no token" if `gh` is missing/errors, and is never written to config.

### `init` command (`commands/init.ts`)

Add a source-selection step before writing the global JSON config:

1. Ask which source(s): **GitHub Issues**, **Feishu Base**, or **both**.
2. GitHub Issues → prompt `owner` / `repo` (default from `gh repo view` when available) and `defaultAgent`; do not store a token.
3. Feishu Base → existing `baseToken` / `tableId` prompts.
4. Agent auto-detection unchanged.
5. Write `~/.agent-task-loop/config.json` with `feishu` and/or `githubIssues`; `projects` / `repositories` stay empty.

## Behavior Matrix

| Config | Provider | Runtime guard | `schema` |
| --- | --- | --- | --- |
| feishu only | Feishu (direct) | placeholder check | runs |
| githubIssues only | GitHub (direct) | pass (no feishu check) | notice + exit 0 |
| both | Composite, default=feishu | placeholder check on feishu | runs (feishu) |
| neither | — | **error: configure a source** | — |

## Testing

- **schema (zod)**: feishu-only / github-only / both valid; neither rejected.
- **load-config**: resolves `--config` then env then global; missing → error; `.json` parsed; a non-JSON path is rejected (no dynamic import); cwd walk-up no longer consulted.
- **buildTaskProvider**: github-only → single GitHub provider; feishu-only → single Feishu; both → composite, `defaultSource = feishu`.
- **runtime-guard**: github-only passes; feishu placeholder still rejected when feishu present; neither rejected.
- **github token**: falls back to `gh auth token`; degrades to unauthenticated when `gh` unavailable (mocked).
- **init**: choosing GitHub writes `githubIssues` and omits `feishu`.

## Alternatives Considered

- **Keep Feishu required; GitHub Issues secondary only.** Rejected: forces a GitHub project to maintain a Feishu Base.
- **Keep multi-format / cwd config discovery.** Rejected: more surface than needed; cwd walk-up is a footgun and `.ts` needs a TS runtime. `--config` covers the "specific file" case.

## Compatibility

- Feishu (or Feishu + GitHub) configs are unchanged in behavior. Making a required field optional never invalidates an existing valid config.
- **Breaking**: `.ts`/`.js` config files and the `task.config.*` cwd walk-up are no longer supported — migrate to a JSON config (global or `--config`). The package is pre-1.0 with essentially a single user, so this is acceptable now rather than later.

Closes #24 once implemented.
