# Agent Guidelines

This repository is intended to be public. Treat every change as if it may be read, forked, packaged, and indexed.

## Working Rules

- Keep changes scoped to the user request and the surrounding code.
- Prefer existing project patterns over new abstractions.
- Before non-trivial work, provide a short plan covering intended steps, key assumptions, and verification.
- Use a lightweight workflow: match the amount of planning, design, issue tracking, and RFC process to the size of the task.
- Small tasks can proceed after a one-sentence plan. Small tasks are usually single-file edits, small fixes, simple commands, copy changes, or low-risk configuration updates.
- Medium tasks should start with a short plan and may use a GitHub issue as a discussion or tracking entry. Medium tasks usually touch multiple files, user-visible behavior, tests, or small refactors.
- Large tasks should be discussed first and tracked with a GitHub issue and/or RFC before implementation. Large tasks include new capabilities, new packages or technology stacks, architecture boundary changes, stable APIs or schemas, cross-module impact, or work that may need multiple pull requests.
- Do not commit local config, credentials, generated logs, workspaces, or machine-specific paths.
- Do not add internal company domains, private repository names, private tokens, or personal filesystem paths.
- Use `rg` for searches when available.
- Use `pnpm test` and `pnpm build` before claiming implementation work is complete.
- For package changes, run `npm pack --dry-run --registry=https://registry.npmjs.org` from the package directory and inspect the file list.

## Documentation

- Use `CONTRIBUTING.md` for contribution workflow.
- Use `rfcs/` for substantial design proposals.
- Use `docs/` for operational guides and reference material.
- Use RFCs for design decisions, not as a replacement for execution plans. RFCs should explain motivation, goals, non-goals, proposed design, alternatives, risks, and open questions.
- RFCs start as `Proposed`; after review, update the status to `Accepted`, `Rejected`, or `Superseded` as appropriate.
- Use `docs/plans/` for implementation plans when a task needs explicit execution breakdown.
- Keep README focused on orientation and quick start.

## Git

- Branch names should be short and descriptive with conventional prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, or `test/`.
- Open pull requests as drafts by default until the work is ready for formal review.
- Pull request descriptions should include a summary, design or tracking links when relevant, validation commands, and known risks.
- Commit messages should be concise and use conventional prefixes when they fit.
- Signed commits are preferred.

## Public Safety Check

Before pushing public-facing changes, scan for accidental internal references:

```bash
rg --hidden --no-ignore -n "internal-domain.example|/Users/|private-token|secret" . \
  --glob '!node_modules/**' \
  --glob '!packages/agent-task-loop/node_modules/**' \
  --glob '!.git/**'
```
