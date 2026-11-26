# Documentation Standards

Use `docs/` for durable project knowledge that a maintainer or user cannot easily infer from reading the code alone. This includes current architecture and tradeoffs, user guides, factual references, development workflows, and validation boundaries.

Keep collaboration policy in `CONTRIBUTING.md`, AI-agent instructions in `AGENTS.md`, issue and review evidence requirements in templates, and automated enforcement in scripts or CI workflows. Package-specific usage stays in each package's `README.md` (for example [`packages/agent-task-loop/docs/rivus-plugin.md`](../packages/agent-task-loop/docs/rivus-plugin.md) and [`apps/room-web/README.md`](../apps/room-web/README.md)).

## What Is Here

Guides:

- [`getting-started.md`](getting-started.md): install, first run, common commands.
- [`configuration.md`](configuration.md): config resolution, `init`, `source`, task sources, projects, repositories, agents.
- [`workflow.md`](workflow.md): task status lifecycle and agent rounds.

Architecture ([`architecture/`](architecture/)), the current system shape:

- [`overview.md`](architecture/overview.md): packages, bounded contexts, dependency rules, review gate.
- [`task-sources.md`](architecture/task-sources.md): provider composition, run-time state store, task run lease.
- [`agent-finder.md`](architecture/agent-finder.md): agent discovery through `@rivus/agent-kit`.
- [`agent-sessions.md`](architecture/agent-sessions.md): session discovery, transcripts, the session browser.
- [`agent-collaboration.md`](architecture/agent-collaboration.md): Room protocol, control plane, room-web, task board.

Development & release:

- [`npm-publish.md`](npm-publish.md): npm release runbook.

Add `guides/`, `reference/`, `architecture/`, or `development/` sections when the project has real documentation for that reader need. Do not create empty directories to match a list.

## Active Plans Boundary

- [`plans/`](plans/) contains active implementation plans only while non-trivial work is in flight.

The Change Design Gate in [`CONTRIBUTING.md`](../CONTRIBUTING.md#change-design-gate) decides when a change needs a plan. After the code lands on the default branch, move lasting non-code knowledge into `docs/` (and local `Why:` comments in code), move remaining follow-up items to issues, and delete the completed plan. Git history and the delivery PR keep the full plan, including the RFCs this repository used earlier.

## Writing Standards

- Give every durable document one clear audience, purpose, and owner area.
- Record what source code cannot express: _why_ a design or workaround was chosen, alternatives rejected, ownership and trust boundaries, external system quirks, and known validation limits.
- Do not duplicate directory trees, symbol lists, or type signatures that source code and type checks already express.
- Prefer current-state language over historical narration in `docs/`; link to the delivery PR for decision history.
- Keep examples runnable when practical; otherwise label them as illustrative and explain the validation gap.
- Link to source files, commands, schemas, or dashboards when they are the real source of truth.
- Update docs in the same change as behavior, configuration, command, API, deployment, architecture, or operational changes.
- Keep private tokens, internal hostnames, personal filesystem paths, generated logs, and environment-specific secrets out of documentation.
