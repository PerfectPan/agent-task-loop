# Configuration

Agent Task Loop looks for configuration in this order:

1. `--config <path>`
2. `AGENT_TASK_LOOP_CONFIG`
3. `task.config.ts` or `task.config.json` in the current directory or a parent directory
4. the package example config

Start from:

```bash
cp packages/agent-task-loop/task.config.example.ts task.config.ts
```

## Feishu Base

```ts
feishu: {
  baseToken: 'base_token',
  tableId: 'table_id',
}
```

The table must include the task fields managed by `schema`. Run:

```bash
npx --no-install @rivus/agent-task-loop schema
```

If fields are missing and the credentials can modify the table, run:

```bash
npx --no-install @rivus/agent-task-loop schema --apply
```

## Projects

A project maps task metadata to a default repository and workspace root.

```ts
projects: {
  demo: {
    key: 'demo',
    name: 'Demo',
    defaultRepository: 'demo_app',
    workspaceRoot: '/workspace/demo',
    taskTemplatePrompt: '',
  },
}
```

## Repositories

Repository config tells the runner how to prepare, test, build, and optionally deploy a workspace.

```ts
repositories: {
  demo_app: {
    key: 'demo_app',
    localPath: '/workspace/demo-app',
    defaultBranch: 'main',
    installCommand: 'pnpm install',
    testCommand: 'pnpm test',
    buildCommand: 'pnpm build',
    workspaceStrategy: 'worktree',
  },
}
```

Use `workspaceStrategy: 'existing-repo'` only when the task should run directly in the configured repository checkout.

## Agents

Agents are local commands. Keep credentials in the environment, not in the config file.

```ts
agents: {
  codex: {
    name: 'codex',
    command: 'codex',
    args: [],
    env: {},
  },
}
```

## Public Safety

Do not commit local credentials, personal paths, generated workspaces, logs, or machine-specific config. Keep real deployment config outside the repository or in ignored files.
