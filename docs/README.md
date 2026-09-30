# Documentation Standards

Use `docs/` for durable project knowledge that a maintainer should be able to read without replaying pull requests or chat history. This includes current architecture, development guides, operational runbooks, and factual references.

Keep collaboration policy in `CONTRIBUTING.md`, AI-agent instructions in `AGENTS.md`, issue and review evidence requirements in templates, and automated enforcement in scripts or CI workflows. Package-specific usage stays in each package's `README.md` (for example [`packages/agent-task-loop/docs/rivus-plugin.md`](../packages/agent-task-loop/docs/rivus-plugin.md) and [`apps/room-web/README.md`](../apps/room-web/README.md)).

## What Is Here

Guides:

- [`getting-started.md`](getting-started.md): install, first run, common commands.
- [`configuration.md`](configuration.md): config resolution, `init`, `source`, task sources, projects, repositories, agents.
- [`workflow.md`](workflow.md): task status lifecycle and agent rounds.

Architecture ([`architecture/`](architecture/)), the current system shape:

- [`overview.md`](architecture/overview.md): packages, bounded contexts, dependency rules, review gate.
- [`task-sources.md`](architecture/task-sources.md): provider composition, run-time state store, task run lease.
- [`agent-finder.md`](architecture/agent-finder.md): agent discovery and the MoonBit build pipeline.
- [`agent-sessions.md`](architecture/agent-sessions.md): session discovery, transcripts, the session browser.
- [`agent-collaboration.md`](architecture/agent-collaboration.md): Room protocol, control plane, room-web, task board.

Operations:

- [`npm-publish.md`](npm-publish.md): npm release runbook.
- [`moonbit-publish.md`](moonbit-publish.md): MoonBit module release runbook.

Add `development/`, `reference/`, `operations/`, or `tutorials/` sections when the project has real documentation for that reader need. Do not create empty directories to match a list.

## Spec And Plan Boundary

- [`../specs/`](../specs/) declares active product behavior and acceptance contracts.
- [`plans/`](plans/) contains active technical decisions and detailed execution plans.

The Change Design Gate in [`CONTRIBUTING.md`](../CONTRIBUTING.md) decides which artifacts a change needs. After delivery, lasting constraints belong in current-state `docs/`. Git history keeps the retired Spec or Plan, including the RFCs this repository used before adopting Specs and Plans.

## Writing Standards

- Give every durable document one clear audience, purpose, and owner area.
- Prefer current-state language over historical narration in `docs/`; link to the delivery PR for decision history.
- Keep examples runnable when practical; otherwise label them as illustrative and explain the validation gap.
- Link to source files, commands, schemas, or dashboards when they are the real source of truth.
- Update docs in the same change as behavior, configuration, command, API, deployment, architecture, or operational changes.
- Keep private tokens, internal hostnames, personal filesystem paths, generated logs, and environment-specific secrets out of documentation.
