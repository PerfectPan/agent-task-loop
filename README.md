# Agent Task Loop

Agent Task Loop is a monorepo for AI coding agent task delivery workflows.

The core package provides a local CLI that drives tasks from assignment through execution, review, rework, and publish-ready handoff. It is an integration layer over your existing trackers rather than a system of record: tasks are read from their owning backend (Feishu Base today, GitHub Issues optionally) and writes route back to that source.

## Documentation

- Getting started (install, first run, common commands): [docs/guides/getting-started.md](./docs/guides/getting-started.md)
- Configuration reference: [docs/reference/configuration.md](./docs/reference/configuration.md)
- Workflow & task lifecycle (diagrams): [docs/guides/workflow.md](./docs/guides/workflow.md)
- Architecture (packages, boundaries, subsystems): [docs/architecture/overview.md](./docs/architecture/overview.md)

## Monorepo Layout

- `packages/agent-task-loop`: CLI package, task loop runtime, and Rivus Task Manager Plugin
- `packages/agent-finder-cli`: local coding-agent discovery and session browser CLI (`@rivus/agent-finder-cli`, MIT)
- `packages/agent-room`: internal Room collaboration protocol package (`@rivus/agent-room`)
- `apps/room-web`: local multi-agent collaboration workspace and read-only task board (React Router)
- `apps/web`: marketing/landing site (Next.js)

## Workspace Commands

- `pnpm install`
- `pnpm test`
- `pnpm build`
- `pnpm knip` fails CI on unused files, exports, dependencies, configuration hints, or tag hints.
- `pnpm knip:production` runs the same check over production entries only, so a file or export that only tests reach fails it; `knip.ts` says what it leaves out and when an export carries `@internal`.
- `pnpm changeset`

## License

GPL-3.0-only (see [LICENSE](./LICENSE)), except these library and tool packages, which are MIT and ship their own `LICENSE`:

- `@rivus/agent-finder-cli`: [`packages/agent-finder-cli/`](./packages/agent-finder-cli/)

Tools and libraries use MIT; applications use GPL-3.0-only. See [CONTRIBUTING.md](./CONTRIBUTING.md#license).

## Contributing

- Contribution workflow: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Agent guidelines: [AGENTS.md](./AGENTS.md)
- Active plans: [docs/plans/](./docs/plans/)
- Documentation map: [docs/README.md](./docs/README.md)
- npm publishing: [docs/development/npm-publish.md](./docs/development/npm-publish.md)

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
