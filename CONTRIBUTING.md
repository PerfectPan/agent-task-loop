# Contributing

Thanks for taking the time to improve Agent Task Loop.

## Development Setup

```bash
pnpm install
pnpm test
pnpm build
```

Run the local CLI from the repository root:

```bash
npx --no-install agent-task-loop --help
```

## Contribution Flow

1. Open an issue or discussion for ambiguous work.
2. Write an RFC for substantial changes.
3. Create a focused branch.
4. Add or update tests for behavior changes.
5. Run `pnpm test` and `pnpm build`.
6. Open a pull request with the motivation, implementation notes, and validation results.

Small fixes, typo corrections, dependency metadata updates, and narrow documentation improvements do not need an RFC.

## When to Write an RFC

Use `rfcs/` when a change affects:

- public CLI behavior
- package publishing or release process
- task lifecycle semantics
- configuration shape
- security boundaries
- repository structure
- long-term integration strategy

RFCs should describe the problem, goals, non-goals, proposed design, alternatives, rollout plan, and risks.

## Pull Request Expectations

Every PR should answer:

- What changed?
- Why is this change needed?
- How was it tested?
- Are there follow-up tasks?

For npm package changes, include the output summary from:

```bash
cd packages/agent-task-loop
npm pack --dry-run --registry=https://registry.npmjs.org
```

## Public Repository Hygiene

Do not commit private tokens, local config, generated workspaces, internal hostnames, or personal filesystem paths.

The project intentionally keeps package contents narrow. If a file should ship to npm, it must be included through `packages/agent-task-loop/package.json#files`.
