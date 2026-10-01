# Contributing

Thanks for taking the time to improve Agent Task Loop.

## Development Setup

```bash
pnpm install
gh extension install PerfectPan/gh-repo-checks
./scripts/install-git-hooks.sh
pnpm test
pnpm build
```

Use the pnpm version pinned in `packageManager` (pnpm 12). pnpm runs dependency build scripts only for packages listed in `allowBuilds` in `pnpm-workspace.yaml`; when an install fails with `ERR_PNPM_IGNORED_BUILDS`, add the package there with `true` or `false` and a comment saying why. pnpm also keeps its default `minimumReleaseAge` of one day, stated in the same file: an install that needs a version published in the last 24 hours fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, so pick an older version instead of lowering the setting.

`pnpm test` also runs `moon -C packages/agent-finder test`, so the MoonBit toolchain must be on `PATH`; CI installs it with the official `cli.moonbitlang.com` installer.

Run the local CLI from the repository root:

```bash
npx --no-install @rivus/agent-task-loop --help
```

## Contribution Flow

1. Open an issue or discussion for ambiguous work.
2. Choose Spec and Plan artifacts using the [Change Design Gate](#change-design-gate) before substantial work, and review the behavior and technical design before implementing that scope.
3. Create a focused branch.
4. Install local Git hooks with `./scripts/install-git-hooks.sh` if this checkout has not already done so.
5. Add or update tests for behavior changes.
6. Add a changeset for user-facing package changes.
7. Run the [Required Checks](#required-checks).
8. Update `README.md`, `docs/`, or the active Spec and Plan when user-facing behavior, architecture, workflow, or operations change.
9. Open a pull request with a conventional title, a summary of what changed and why, validation with skipped gates, and any risks.
10. Keep the PR description current after review feedback, rebases, validation reruns, or scope changes.

Small fixes, typo corrections, dependency metadata updates, and narrow documentation improvements do not need a separate Spec and Plan.

## Required Checks

CI (`.github/workflows/ci.yml` and `.github/workflows/review.yml`) runs these on every pull request; run them locally before opening review:

```bash
# Repository checks:
gh repo-checks repository

# PR title and description:
gh repo-checks pr-title "docs: update contributing guide"
gh repo-checks pr-body pr-body.md

# Install and CI gates:
pnpm install --frozen-lockfile
pnpm format:check
pnpm check:moonbit-version
pnpm test
pnpm build
pnpm typecheck
pnpm lint
```

`pnpm format` applies the formatting. `pnpm lint` is type-aware: it resolves workspace packages through their built `dist` types and room-web through the route types that `pnpm typecheck` generates, so run it after `pnpm build` and `pnpm typecheck`.

### Lint, Format, And TypeScript Config

Shared rules come from [`@perfectpan/lint-config`](https://github.com/PerfectPan/lint-config), installed as a git dependency pinned to a tag. This repository keeps only its own settings:

- `.oxlintrc.json` extends the shared oxlint config and adds ignore paths, `vitest/valid-expect` with a message argument, and test-only overrides. `vitest/require-mock-type-parameters` is off until the existing untyped mocks are migrated. room-web's route modules, `app/root.tsx` and the shadcn/ui components in `app/components/ui` are exempt from `react/no-multi-comp`, because the framework and the generator put several components in those files.
- `oxfmt.config.ts` spreads the shared oxfmt options and keeps single quotes and trailing commas, the style most existing code used.
- `tsconfig.base.json` extends the shared `bundler` tsconfig; every package and `apps/room-web` extend it and add only their own `jsx`, `types`, `outDir`, and `include`. `noUncheckedIndexedAccess` stays off until the existing code is migrated; `exactOptionalPropertyTypes` is off in the shared config. `apps/web` keeps the Next.js tsconfig.

Upgrade the shared rules by bumping the tag in `package.json`, then fix or explicitly override what the new release reports.

For package-facing changes, also run `pnpm changeset status` and the `npm pack --dry-run` check in [Pull Request Expectations](#pull-request-expectations).

## Changesets

Use Changesets for package version and changelog entries:

```bash
pnpm changeset
```

Choose `patch`, `minor`, or `major` according to the public package impact. Documentation-only changes, repository metadata changes, tests, and internal maintenance that do not affect a published package can skip a changeset.

Only published packages get changesets. Private workspace packages (`private: true`) are not versioned or tagged by Changesets (`privatePackages` in [`.changeset/config.json`](.changeset/config.json)). Changelog entries link the pull request and author through `@changesets/changelog-github`.

### Releasing

1. When changesets land on `main`, `.github/workflows/publish.yml` opens or updates the release PR `chore(release): version packages` on the branch `changeset-release/main` by running `pnpm version-packages` (Changesets bumps and changelogs, then the MoonBit module version sync). Later changesets fold into the same PR.
2. The release PR is opened with the workflow's `GITHUB_TOKEN`, and GitHub does not start workflows for events that token causes, so CI does not run on it by itself. Before merging, a person closes and reopens it (`gh pr close <n> && gh pr reopen <n>`) or pushes an empty commit to its branch. `gh workflow run ci.yml` does not count: a dispatched run is not attached to the PR and does not satisfy required checks.
3. Merging the release PR runs `publish.yml` again: gates, then `pnpm release` publishes unpublished versions to npm through OIDC trusted publishing with provenance, then the MoonBit publish workflow runs. See [`docs/npm-publish.md`](docs/npm-publish.md).

## SDD Workflow And Document Lifecycle

1. Record the problem, affected users or maintainers, in-scope behavior, non-goals, and acceptance conditions.
2. Choose artifacts with the [Change Design Gate](#change-design-gate). Product work defaults to one behavioral Spec and one detailed Plan for the same deliverable. The Spec states required behavior: interactions and acceptance scenarios. The Plan owns the technical decisions (design, component and interface changes, data flow) and the detailed execution plan (ordered tasks, tests, exit conditions, validation, and rollback).
3. Review the behavior and technical design before implementing the affected scope. The Plan must resolve implementation decisions rather than leave them to the implementer; keep it blocked while a material decision is unresolved. New behavior revises the Spec. New implementation decisions revise the Plan.
4. Implement inside that boundary. Add evidence for each acceptance condition, or say why existing evidence is enough. Update current-state docs in the same change.
5. Before retiring a completed Spec or Plan, move still-valid behavior, invariants, and operational limits into current-state docs and tests. The final delivery PR may delete the completed files. Keep an unfinished Spec or Plan active.
6. Git history and the delivery PR keep the retired decision. Do not copy completed Specs or Plans into a second archive.

## Change Design Gate

Every change needs a requirement record. Use the smallest set of artifacts that makes behavior and implementation reviewable.

| Change type                                      | Required artifact                                              |
| ------------------------------------------------ | -------------------------------------------------------------- |
| Product behavior                                 | One Spec plus one detailed Plan for the same deliverable       |
| Technical refactor without changed user behavior | Detailed Plan with compatibility and acceptance conditions     |
| Narrow maintenance, tests, or documentation      | Requirement and PR checklist; a separate Plan only when useful |

In this repository, changes to public CLI behavior, package publishing or the release process, task lifecycle semantics, configuration shape, security boundaries, repository or package structure, and long-term integration strategy count as product behavior or technical refactors, not narrow maintenance.

A Spec defines observable interactions, scope, failure behavior, and acceptance examples. Use stable scenario IDs and Given/When/Then where useful. Link scenarios to tests. A Spec does not prescribe components, interfaces, or execution order. Keep active Specs under [`docs/specs/`](docs/specs/). A small change may keep both sections in the PR description. Split only when each slice has an independently demonstrable outcome.

A Plan records technical decisions and the detailed execution plan that implements them. Shared architecture, compatibility, security, and recovery decisions belong in a reviewed Plan. After implementation, move lasting constraints into current-state architecture or operations docs. This repository does not keep an RFC directory; the RFCs it used earlier are retired into current-state docs, Specs, and Plans, and remain in Git history. Removing a proposal does not mark unimplemented ideas as delivered.

Number a Spec and its paired Plan with the same four-digit id. Scope carried over from a retired RFC keeps that RFC's number; new work takes the next free number across both directories.

## Implementation Plans

[`docs/plans/`](docs/plans/) contains active Plans: technical decisions plus a detailed execution plan. Copy [`0000-template.md`](docs/plans/0000-template.md) and keep only the sections that apply. A product plan links its paired Spec. Explain the current constraints, the decisions, the boundaries, the failure and rollback behavior, and how the change will be verified. A file list alone is not a design.

The execution plan tells the implementer exactly what to do: preconditions, a completion contract, ordered tasks with files, changes, tests, and exit conditions, a validation ledger, and rollback per batch. Keep the plan blocked while a decision that changes scope, interfaces, data, or rollout is unresolved.

Keep unknown owners, dates, and interfaces marked "unconfirmed". A plan may make feature-specific technical decisions, but it cannot silently override current architecture. At completion, migrate lasting constraints into current-state docs and tests, then delete the completed Spec and plan in the final delivery PR. Keep unfinished scope visible.

## Documentation Standards

- Use `README.md` for orientation, quick start, and current user-facing behavior.
- Use `CONTRIBUTING.md` for contribution workflow, review expectations, and repository policy.
- Use `AGENTS.md` for AI-agent instructions.
- Use `docs/specs/` for active product behavior and acceptance contracts.
- Use `docs/plans/` for active technical decisions and detailed execution plans.
- Use `docs/` for durable current-state knowledge; `docs/architecture/` describes the current system shape.

Follow [`docs/README.md`](docs/README.md) when adding or reorganizing documentation.

## Pull Request Expectations

The PR template has three sections:

- **Summary**: what changed and why, with links to the issue, Spec, or Plan.
- **Validation**: the commands you ran and their results, evidence for behavior or packaging claims, and skipped gates with reasons.
- **Risks** (optional): compatibility, rollout, rollback, or follow-up risks. Delete it when there are none.

Use a conventional title:

```text
type(scope): summary
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Titles are English; `gh repo-checks pr-title` rejects CJK characters. Bot-generated PRs follow the same rule: the Changesets release PR uses `chore(release): version packages`, and dependency bots should emit titles such as `chore(deps): bump <package> to <version>`.

Summary and Validation from the [PR template](.github/pull_request_template.md) must be present and contain real content, not template placeholders; other sections are optional. Do not include agent attribution lines such as "Generated with <tool>"; the author is accountable for the content. `gh repo-checks pr-body` enforces these rules, and the `PR description` job runs it on every pull request event, including description edits. PRs opened by bot accounts skip the description check, because dependency and release bots write their own bodies; they still must pass the title check. A skipped job still satisfies the required status check.

Update the description when review feedback, rebases, or follow-up commits change the scope or validation result. Reviewers should be able to understand the final state from the PR without reconstructing it from comments.

For npm package changes, include the output summary from:

```bash
cd packages/agent-task-loop
npm pack --dry-run --registry=https://registry.npmjs.org
```

## Release Notes

Release notes come from Changesets. Each user-facing change to a published package adds a change file (`pnpm changeset`, see [Changesets](#changesets)) in the same PR, and `pnpm version-packages` writes that package's `CHANGELOG.md` at release time: [`@rivus/agent-task-loop`](packages/agent-task-loop/CHANGELOG.md), [`@rivus/agent-finder-cli`](packages/agent-finder-cli/CHANGELOG.md), [`@rivus/agent-finder-core`](packages/agent-finder/CHANGELOG.md). Do not edit generated changelogs or keep a hand-written root `CHANGELOG.md` beside them.

## License

Tools and libraries use MIT; applications use GPL-3.0-only. The repository is licensed under GPL-3.0-only (`LICENSE`), except these packages, which are MIT and ship their own `LICENSE`:

| Package                                                                     | Directory                    |
| --------------------------------------------------------------------------- | ---------------------------- |
| `@rivus/agent-finder-core` and the MoonBit module `PerfectPan/agent-finder` | `packages/agent-finder/`     |
| `@rivus/agent-finder-cli`                                                   | `packages/agent-finder-cli/` |
| `@rivus/agent-sessions` (private)                                           | `packages/agent-sessions/`   |
| `@rivus/rslib-config` (private shared build config)                         | `packages/rslib-config/`     |

Everything else, including `@rivus/agent-task-loop`, `@rivus/agent-room`, `@rivus/agent-orchestration` and `apps/`, is GPL-3.0-only. Distributing a GPL-3.0-only package or a modified version requires releasing its source under the same license.

Package metadata (`package.json`, and `moon.mod.json` for the MoonBit module) uses the SPDX identifier of the package's license, and an MIT package lists `LICENSE` in its published files. An MIT package must not import or bundle code from a GPL-3.0-only workspace package: `@rivus/agent-finder-cli` bundles `@rivus/agent-sessions` into its `dist/`, so both stay MIT together. GPL-3.0-only packages may use the MIT ones. `pnpm test` enforces the rule from the metadata: [`tests/license/license-boundary.test.mjs`](tests/license/license-boundary.test.mjs) fails when a workspace package has no `license` field or an MIT package lists a GPL-3.0-only workspace package in any dependency field. Change a license only as a deliberate project decision, and keep third-party notices for code or data copied from other projects.

## Repository Checks

Do not commit private tokens, local config, generated workspaces, internal hostnames, or personal filesystem paths. Test fixtures use neutral paths such as `/fake-home/...` or `/work/...`, and fixture files avoid ignored extensions such as `.log`.

The project intentionally keeps package contents narrow. If a file should ship to npm, it must be included through the package's `package.json#files`; verify it appears in the `npm pack --dry-run` output.

The review checks come from [`PerfectPan/gh-repo-checks`](https://github.com/PerfectPan/gh-repo-checks): CI runs them through its GitHub Action (`uses: PerfectPan/gh-repo-checks@v1`), and locally they run as a GitHub CLI extension (`gh extension install PerfectPan/gh-repo-checks`). Do not copy the check scripts into this repository; change them upstream. Repository-specific additions, such as extra required files or forbidden patterns, go in [`.github/repo-checks.conf`](.github/repo-checks.conf), and repository-specific scripts run as extra steps after the shared check. `.github/workflows/review.yml`, `.githooks/pre-commit`, `.github/repo-checks.conf` and `scripts/install-git-hooks.sh` are copied verbatim from the shared project template; change them upstream so later syncs stay a plain diff.

Run `gh repo-checks repository` locally before opening review. It does not replace the pnpm gates, but it catches missing template files, tracked local artifacts, obvious secrets, private paths, and drift between the GitHub PR and GitLab MR templates.

Workflows reference actions by their latest major version tag, such as `actions/checkout@v7`, not by commit SHA. Workflow files copied from the project template take action upgrades from the template rather than local edits.

## Local Git Hooks

Install local hooks after cloning:

```bash
gh extension install PerfectPan/gh-repo-checks
./scripts/install-git-hooks.sh
```

The pre-commit hook runs `git diff --cached --check` and `gh repo-checks repository --staged` before a commit is created; without the extension it warns and skips the repository check. Hooks are a local guardrail; CI and branch protection remain the authoritative enforcement because hooks can be missing or bypassed.

If `core.hooksPath` is already set to another path, `scripts/install-git-hooks.sh` fails instead of overwriting it. Re-run with `--force` only after confirming the existing hooks can be replaced or moved into `.githooks`.

## Repository Setup

`main` is covered by the repository ruleset `Default`, which blocks deletion and force pushes. Required review checks are not configured yet. Preview the template's protection payload for this repository with:

```bash
gh repo-checks protect --repo PerfectPan/agent-task-loop --approvals 0 --check test
```

It requires pull requests, linear history, resolved conversations, and the `Review` workflow checks `repository checks`, `conventional PR title`, and `PR description`, plus the CI `test` job. `--approvals 0` fits a single maintainer, who cannot approve their own pull requests. Because the repository already uses a ruleset, add these checks to the `Default` ruleset in the repository settings instead of applying classic branch protection with `--apply`.

## Security Reports

Use [`SECURITY.md`](SECURITY.md) for vulnerability reporting guidance. Do not include secrets, exploit details, or private infrastructure in public issues or pull requests.
