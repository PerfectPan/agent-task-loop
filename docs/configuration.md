# Configuration

Agent Task Loop reads one JSON config file. It is resolved from exactly three
places, first match wins, with no merging between them:

1. `--config <path>` (must exist)
2. the `AGENT_TASK_LOOP_CONFIG` environment variable
3. `~/.agent-task-loop/config.json` (the global config)

There is no per-directory `task.config.*` discovery and no TypeScript or
JavaScript config. With none of the three present, commands fail with a
message pointing at `agent-task-loop init`.

The full shape is in
[`packages/agent-task-loop/config.example.json`](../packages/agent-task-loop/config.example.json).

## Create the config

```bash
npx --no-install @rivus/agent-task-loop init
```

`init` asks which task source to use (GitHub Issues, Feishu Base, or both),
runs local agent discovery and pre-fills `claude` and `codex` entries for
agents that are runnable, and writes `~/.agent-task-loop/config.json`. A
Feishu source needs `lark-cli` on `PATH`; `init` offers to install it. `init`
never overwrites an existing config and points at `source add` instead. Fill
in `projects` and `repositories` afterwards.

## Manage task sources

```bash
agent-task-loop source list
agent-task-loop source add --type github --owner you --repo your-repo
agent-task-loop source add --type feishu --token <base> --table <tableId>
agent-task-loop source remove github:you/your-repo
```

`source add` merges into the config without touching unrelated blocks. Adding
a second GitHub repository converts the single-repo shorthand to
`repositories[]` and rejects a duplicate `owner/repo`. `source remove` refuses
to remove the last source. Every write is validated against the config schema
first. Without flags in a terminal, `add` prompts for missing values; without a
terminal, missing values are an error. All subcommands accept `--config`.

## Task sources

At least one of `feishu` and `githubIssues` is required.

```json
{
  "feishu": { "baseToken": "base_token", "tableId": "table_id" },
  "githubIssues": {
    "defaultAgent": "codex",
    "repositories": [
      { "owner": "your-org", "repo": "service-a" },
      { "owner": "your-org", "repo": "service-b", "defaultAgent": "claude" }
    ]
  }
}
```

- `feishu` optionally takes `viewId`. Run `schema` to check the Base fields and
  `schema --apply` to create missing ones.
- `githubIssues` takes either `owner` + `repo` or `repositories[]`; each repo
  becomes the source `github:<owner>/<repo>`. The token is resolved from
  `githubIssues.token`, then `GITHUB_TOKEN`, then `gh auth token`, so a
  `gh`-authenticated machine needs no token in the file.
- With both sources configured, new tasks go to Feishu unless a source is
  chosen.

How sources are combined and where run-time state is kept is described in
[`architecture/task-sources.md`](architecture/task-sources.md).

## Projects

A project maps task metadata to a default repository and workspace root. For
GitHub-sourced tasks the project key must equal the repository name.

```json
"projects": {
  "demo": {
    "key": "demo",
    "name": "Demo",
    "defaultRepository": "demo_app",
    "workspaceRoot": "/workspace/demo",
    "taskTemplatePrompt": ""
  }
}
```

## Repositories

Repository config tells the runner how to prepare, test, build, and optionally
deploy a workspace.

```json
"repositories": {
  "demo_app": {
    "key": "demo_app",
    "localPath": "/workspace/demo-app",
    "defaultBranch": "main",
    "installCommand": "pnpm install",
    "testCommand": "pnpm test",
    "buildCommand": "pnpm build",
    "workspaceStrategy": "worktree"
  }
}
```

Use `workspaceStrategy: "existing-repo"` only when the task should run directly
in the configured checkout.

## Agents

Agents are local commands. Supported names are `claude`, `codex`, `coco`, and
`glm`. Keep credentials in the environment, not in the config file.

```json
"agents": {
  "codex": { "name": "codex", "command": "codex", "args": [], "env": {} }
}
```

## Public Safety

Do not commit local credentials, personal paths, generated workspaces, logs, or
machine-specific config. The global config lives outside any repository.
