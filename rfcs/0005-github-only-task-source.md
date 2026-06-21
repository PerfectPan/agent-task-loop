# RFC 0005: GitHub-Issues-Only Task Source

## Status

Proposed

## Summary

Make Feishu Base an optional task source so Agent Task Loop can run with **GitHub Issues as the sole backend**. Today `feishu` is a required config block and every live command asserts a real Feishu Base, so GitHub Issues only works as a *secondary* source layered on top of Feishu. This RFC removes that coupling: a config with only `githubIssues` (and no `feishu`) is valid and fully runnable. It also teaches `init` to choose the source interactively and resolves the GitHub token from the `gh` CLI so `gh`-authenticated users need no token in config.

This completes the remaining tail of #24 (abstract the task backend) and lets the project be iterated through its own GitHub Issues.

## Motivation

The provider abstraction from #29 (`SourceProvider` / `CompositeTaskProvider`) is already source-agnostic: reads fan out and merge, writes route back to each task's owning backend. The only thing forcing Feishu is three hard dependencies:

1. `appConfigSchema.feishu` is a required object.
2. `buildTaskProvider` always constructs a `FeishuTaskProvider` first.
3. `assertFeishuRuntimeConfig` (called by 9 commands) rejects placeholder/absent Feishu values.

A GitHub-hosted project that wants to manage its work via GitHub Issues should not need to stand up and maintain a Feishu Base. Removing the coupling is small and unlocks first-class GitHub-only usage.

## Goals

- A config with `githubIssues` and no `feishu` is valid and runnable across all commands.
- A config with only `feishu` keeps working unchanged (no regression).
- A config with both keeps working (composite, writes routed by source).
- At least one task source is required; a config with neither is rejected with a clear error.
- `init` lets the user pick the source(s); GitHub-only writes a `feishu`-free config.
- `gh`-authenticated users need no GitHub token in config (resolve via `gh auth token`).

## Non-Goals

- Changing `CompositeTaskProvider` internals (already source-agnostic).
- Changing the agent execution / review loop.
- Scaffolding `projects` / `repositories` interactively in `init` (still filled by the user; left empty by `init` as today).
- Supporting task sources other than Feishu and GitHub Issues.
- Executing resume / any new lifecycle behavior.

## Proposed Design

### Config schema (`config/schema.ts`)

- Extract the Feishu shape into `feishuConfigSchema` and make the field optional: `feishu: feishuConfigSchema.optional()`.
- Keep `githubIssues` optional (unchanged).
- Add a refinement on `appConfigSchema`: **at least one of `feishu` / `githubIssues` must be present**, else a clear error (`"configure at least one task source: feishu or githubIssues"`).

### Provider composition (`task-management/build-task-provider.ts`)

Build the source list conditionally:

- push `FeishuTaskProvider` only when `config.feishu` is present;
- push `GitHubIssuesTaskProvider` only when `config.githubIssues` is present;
- one source → return it directly; multiple → `CompositeTaskProvider`.
- `defaultSource` (used for creates with no explicit source): Feishu when present, else GitHub. This keeps existing Feishu behavior and gives a deterministic default for GitHub-only.

### Runtime guard (`config/runtime-guard.ts`)

Rename `assertFeishuRuntimeConfig` → `assertRuntimeConfig(config)`:

- require ≥1 source (defense in depth; schema already enforces it);
- **only** when `config.feishu` is present, run the existing placeholder check on `baseToken` / `tableId`.

Update the 9 callers (`start`, `run`, `watch`, `resume`, `complete`, `reject`, `cleanup`, `tui`, `schema`) to the new name.

### `schema` command (`commands/schema.ts`)

The `schema` command sets up Feishu Base fields (Feishu-specific). When `config.feishu` is absent, print a friendly notice (`"No Feishu source configured; schema applies only to Feishu Base. GitHub Issues need no schema."`) and exit `0`. GitHub Issues are free-form and need no field setup.

### GitHub token resolution (`task-management/github-issues-task-provider.ts`)

Today: `this.config.token ?? process.env.GITHUB_TOKEN`. Extend the fallback chain to reuse the `gh` CLI:

```
config.githubIssues.token  ??  process.env.GITHUB_TOKEN  ??  `gh auth token`
```

The `gh auth token` lookup runs once (cached), is wrapped so a missing/erroring `gh` degrades to "no token" rather than throwing, and is never written to config.

### `init` command (`commands/init.ts`)

Add a source-selection step before writing the global config:

1. Ask which source(s): **GitHub Issues**, **Feishu Base**, or **both**.
2. GitHub Issues → prompt `owner` / `repo` (default from `gh repo view` when available) and `defaultAgent`; do **not** store a token (rely on `gh` / `GITHUB_TOKEN`).
3. Feishu Base → existing `baseToken` / `tableId` prompts.
4. Agent auto-detection is unchanged.
5. Write `~/.agent-task-loop/config.json` with `feishu` and/or `githubIssues` set accordingly; `projects` / `repositories` stay empty (filled by the user).

## Behavior Matrix

| Config | Provider | Runtime guard | `schema` |
| --- | --- | --- | --- |
| feishu only | Feishu (direct) | placeholder check | runs |
| githubIssues only | GitHub (direct) | pass (no feishu check) | notice + exit 0 |
| both | Composite, default=feishu | placeholder check on feishu | runs (feishu) |
| neither | — | **error: configure a source** | — |

## Testing

- **schema (zod)**: feishu-only valid; github-only valid; both valid; neither rejected by the refinement.
- **buildTaskProvider**: github-only → single `GitHubIssuesTaskProvider`; feishu-only → single `FeishuTaskProvider`; both → `CompositeTaskProvider` with `defaultSource = feishu`.
- **runtime-guard**: github-only passes; feishu placeholder still rejected when feishu present; neither rejected.
- **github token**: falls back to `gh auth token` when no config token and no `GITHUB_TOKEN`; degrades to unauthenticated when `gh` is unavailable (mocked).
- **init**: choosing GitHub writes `githubIssues` and omits `feishu`; choosing both writes both.

## Alternatives Considered

- **Keep Feishu required, require GitHub Issues to be secondary.** Rejected: forces a GitHub project to maintain a Feishu Base for no reason.
- **A separate "github" top-level mode flag.** Rejected: redundant — the presence of `githubIssues` / `feishu` already expresses intent; a flag adds a second source of truth.

## Compatibility

Backward compatible. Existing Feishu (or Feishu + GitHub) configs are unchanged in behavior. The only schema change makes a previously-required field optional, which never invalidates an existing valid config.
