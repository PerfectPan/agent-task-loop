# Agent Task Loop

Agent Task Loop is a monorepo for AI coding agent task delivery workflows.

The core package provides a local CLI that drives tasks from assignment through execution, review, rework, and publish-ready handoff. The current task store is Feishu Base, while the repository layout leaves room for future apps such as a website or documentation portal.

## Monorepo Layout

- `packages/agent-task-loop`: CLI package and task loop runtime
- `apps/`: future user-facing apps, such as the official website

## Workspace Commands

- `pnpm install`
- `pnpm test`
- `pnpm build`
- `pnpm changeset`

## License

GPL-3.0-only. See [LICENSE](./LICENSE).

## Contributing

- Contribution workflow: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Agent guidelines: [AGENTS.md](./AGENTS.md)
- Getting started: [docs/getting-started.md](./docs/getting-started.md)
- Configuration: [docs/configuration.md](./docs/configuration.md)
- Agent workflow: [docs/agent-workflow.md](./docs/agent-workflow.md)
- RFCs: [rfcs/](./rfcs/)
- npm publishing: [docs/npm-publish.md](./docs/npm-publish.md)

## Local CLI

After installing dependencies from the repository root, run:

```bash
npx --no-install @rivus/agent-task-loop --help
```

From npm, run:

```bash
npx @rivus/agent-task-loop --help
```

Common commands:

```bash
npx agent-task-loop sync
npx agent-task-loop start --task TASK-101
npx agent-task-loop watch --task TASK-101
npx agent-task-loop resume --task TASK-101
npx agent-task-loop complete --task TASK-101
```
