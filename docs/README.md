# Documentation

Placement, writing rules, and plan retirement: [`docs/AGENTS.md`](AGENTS.md).
Contribution workflow and Change Design Gate: [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Index

Guides:

- [`getting-started.md`](getting-started.md) — install, first run, common commands.
- [`configuration.md`](configuration.md) — config resolution, `init`, `source`, task sources, projects, repositories, agents.
- [`workflow.md`](workflow.md) — task status lifecycle and agent rounds.

Architecture ([`architecture/`](architecture/)):

- [`overview.md`](architecture/overview.md) — packages, bounded contexts, dependency rules, review gate.
- [`task-sources.md`](architecture/task-sources.md) — provider composition, run-time state store, task run lease.
- [`agent-finder.md`](architecture/agent-finder.md) — agent discovery through `@rivus/agent-kit`.
- [`agent-sessions.md`](architecture/agent-sessions.md) — session discovery, transcripts, the session browser.
- [`agent-collaboration.md`](architecture/agent-collaboration.md) — Room protocol, control plane, room-web, task board.

Development & plans:

- [`npm-publish.md`](npm-publish.md) — npm release runbook.
- [`plans/`](plans/) — active implementation plans; each is retired in its final delivery PR.

## Repository-Specific Surfaces

- Package-specific usage and plugin integration docs stay inside their owning packages (for example [`packages/agent-task-loop/docs/rivus-plugin.md`](../packages/agent-task-loop/docs/rivus-plugin.md) and [`apps/room-web/README.md`](../apps/room-web/README.md)).
- Historical RFCs remain in Git history.
