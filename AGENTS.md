# Agent Guidelines

This repository is intended to be public. Treat every change as if it may be read, forked, packaged, and indexed.

## Working Rules

- Keep changes scoped to the user request and the surrounding code.
- Prefer existing project patterns over new abstractions.
- Do not commit local config, credentials, generated logs, workspaces, or machine-specific paths.
- Do not add internal company domains, private repository names, private tokens, or personal filesystem paths.
- Use `rg` for searches when available.
- Update tests and documentation when behavior changes.
- Lint, format, and TypeScript rules come from `@perfectpan/lint-config` (a git dependency pinned to a tag). Keep only repository-specific settings in `.oxlintrc.json`, `oxfmt.config.ts`, and `tsconfig.base.json`; extend the shared configs instead of copying them.

## Project Commands

```bash
# Install the shared review checks and local Git hooks:
gh extension install PerfectPan/gh-repo-checks
./scripts/install-git-hooks.sh

# Repository checks:
gh repo-checks repository

# PR title check:
gh repo-checks pr-title "docs: update contributing guide"

# PR description check (file or stdin):
gh repo-checks pr-body pr-body.md

# Install, then the CI gates:
pnpm install --frozen-lockfile
pnpm format:check   # `pnpm format` rewrites files
pnpm check:moonbit-version
pnpm test
pnpm build
pnpm typecheck
pnpm lint           # after build and typecheck

# Release checks:
pnpm changeset status
# from each changed published package directory:
npm pack --dry-run --registry=https://registry.npmjs.org
```

Do not claim implementation work is complete until the relevant commands pass, or until skipped commands are explained with concrete blockers. For package changes, inspect the `npm pack --dry-run` file list.

## Development Workflow

For non-trivial changes, follow the Spec/Plan selection rules in the [Change Design Gate](CONTRIBUTING.md#change-design-gate). Review required design artifacts before implementation. The Spec states required behavior; the Plan records technical decisions and the ordered tasks, tests, and exit conditions to execute. Do not start a Plan that is blocked on an unresolved decision. Migrate lasting constraints to current-state documentation before deleting a completed Spec or Plan.

Respect the package boundaries in [`docs/architecture/overview.md`](docs/architecture/overview.md); the package-boundary and room-isolation tests enforce them.

## Documentation

- Use `CONTRIBUTING.md` for contribution workflow.
- Use `docs/specs/` for active product behavior and `docs/plans/` for active technical decisions and detailed execution plans. Current-state documentation owns implemented behavior.
- Use `docs/` for durable current-state knowledge: architecture (`docs/architecture/`), guides, and operational runbooks. See `docs/README.md`.
- Keep README focused on orientation and quick start.
- Record user-facing changes to published packages with a changeset (`pnpm changeset`) in the same PR; do not edit generated `CHANGELOG.md` files or add a hand-written root `CHANGELOG.md`.

## AI Delivery Workflow

When an AI agent completes implementation work:

1. Inspect `git status --short --branch`.
2. Verify generated files, secrets, machine paths, and build artifacts are not staged.
3. Run the required verification gates and record the exact commands.
4. Commit pending changes with a concise conventional commit message.
5. Push the branch and verify the remote head.
6. Create or reuse a GitHub Pull Request when the task is not landing directly on `main`.
7. Include a delivery summary with what changed and why, validation, and remaining risks.

## Review Evidence

- PR titles must be English and follow `type(scope): summary`, including bot-generated release and dependency PRs such as `chore(release): version packages`; use `gh repo-checks pr-title` to verify them.
- PR descriptions must have a Summary (what changed and why) and a Validation section (exact commands and results, skipped gates with reasons); add Risks when there are any. Do not add agent attribution lines such as "Generated with <tool>". Verify the body with `gh repo-checks pr-body` before opening or updating the PR. Bot-opened PRs are exempt from the description check, not the title check.
- If a claim depends on logs, screenshots, package output, deployed behavior, or generated artifacts, attach or link the evidence in the PR.
- Update the PR description after substantial code changes, review-driven revisions, rebases that change behavior, or validation reruns.
- Keep the GitHub PR template and the GitLab MR template in sync; `gh repo-checks repository` checks both.

## Git

- Branch names should be short and descriptive, such as `feat/npm-publish-plan`.
- Commit messages should be concise and use conventional prefixes when they fit.
- Signed commits are preferred.
- Do not rewrite or discard user changes unless explicitly requested.

## Publish Safety Check

`gh repo-checks repository` (pre-commit hook and CI) rejects tracked local artifacts, obvious secrets, and personal filesystem paths. Test fixtures use neutral paths such as `/fake-home/...` or `/work/...`. Before pushing public-facing or package-facing changes, also scan for accidental internal references:

```bash
rg --hidden --no-ignore -n "internal-domain.example|/Users/|private-token|secret" . \
  --glob '!node_modules/**' \
  --glob '!**/node_modules/**' \
  --glob '!.git/**' \
  --glob '!AGENTS.md' \
  --glob '!CONTRIBUTING.md' \
  --glob '!SECURITY.md'
```
