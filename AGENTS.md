# Agent Guidelines

This repository is intended to be public. Treat every change as if it may be read, forked, packaged, and indexed.

## Working Rules

- Keep changes scoped to the user request and the surrounding code.
- Prefer existing project patterns over new abstractions.
- Do not commit local config, credentials, generated logs, workspaces, or machine-specific paths.
- Do not add internal company domains, private repository names, private tokens, or personal filesystem paths.
- Use `rg` for searches when available.
- Use `pnpm test` and `pnpm build` before claiming implementation work is complete.
- For package changes, run `npm pack --dry-run --registry=https://registry.npmjs.org` from the package directory and inspect the file list.

## Documentation

- Use `CONTRIBUTING.md` for contribution workflow.
- Use `rfcs/` for substantial design proposals.
- Use `docs/` for operational guides and reference material.
- Keep README focused on orientation and quick start.

## Git

- Branch names should be short and descriptive, such as `feat/npm-publish-plan`.
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
