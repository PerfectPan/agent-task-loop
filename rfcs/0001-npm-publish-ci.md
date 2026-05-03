# RFC 0001: npm Publishing Through GitHub Actions

## Status

Proposed

## Summary

Publish a scoped Agent Task Loop package from GitHub Actions instead of local machines. Use Changesets for versioning and changelog generation. Use a temporary npm token only for the first package bootstrap, then switch to npm Trusted Publishing with GitHub Actions OIDC.

## Motivation

Publishing from a local machine makes releases harder to audit and easier to misconfigure. The project already has CI, a scoped package name, and a narrow npm package file list, so release automation should be handled in the same place as validation.

CI publishing gives the project:

- repeatable release steps
- centralized permissions
- short-lived credentials after Trusted Publishing is configured
- a reviewable release pull request before publication
- generated changelog entries from package changes
- a smaller chance of accidentally publishing to the wrong registry

## Goals

- Publish the package from GitHub Actions.
- Keep the npm package scoped.
- Treat the exact npm scope as a pre-first-publish decision.
- Use Changesets release pull requests as the normal release trigger.
- Keep npm package contents narrow.
- Remove long-lived npm tokens after the first publish.

## Non-Goals

- Publish from feature branches.
- Support publishing from local developer machines as a normal path.

## Proposed Design

### Package Identity

- Current package: `@rivus/agent-task-loop`
- Binary: `agent-task-loop`
- Registry: `https://registry.npmjs.org`
- Access: public
- License: `GPL-3.0-only`

The package should remain scoped. The scope reserves room for future monorepo packages and avoids depending on the global npm namespace.

`@rivus/agent-task-loop` is the current implementation because `@rivus` is the selected personal npm namespace for this project family. The GitHub repository remains `PerfectPan/agent-task-loop`.

Before the first publish, create or reserve the `rivus` npm owner so the `@rivus` scope is controlled by the maintainer. If the project later needs a project-owned scope, it should publish a new package name and maintain a migration path.

Do not use the unscoped `agent-task-loop` package name for the first release. Even if available, it gives the project less room for future packages.

### CI Workflow

The regular CI workflow runs on pull requests and pushes to `main`:

- `pnpm install --frozen-lockfile`
- `pnpm test`
- `pnpm build`

### Publish Workflow

The publish workflow runs on pushes to `main`:

- checkout the repository
- run tests
- build the workspace
- ask Changesets to open or update a release pull request when changeset files exist
- publish unpublished package versions after the release pull request is merged

`workflow_dispatch` can stay as a recovery mechanism, but the normal path is:

1. Feature pull requests include changeset files when package behavior changes.
2. After those pull requests land on `main`, GitHub Actions opens or updates the Changesets release pull request.
3. Merging the release pull request runs `pnpm release`, which builds and publishes through Changesets.

### Authentication

The first publish uses a temporary granular npm token stored as `NPM_TOKEN`. The workflow writes npm auth config only when that secret exists.

After `@rivus/agent-task-loop@0.1.0` exists on npm, configure npm Trusted Publishing for:

- Provider: GitHub Actions
- Owner: `PerfectPan`
- Repository: `agent-task-loop`
- Workflow filename: `publish.yml`

The owner above is the GitHub owner, not the npm scope.

After Trusted Publishing is configured, remove the `NPM_TOKEN` secret. The workflow keeps the bootstrap-token step conditional and publishes through OIDC when no token secret is present.

### Versioning

Changesets owns package versions and changelog entries.

- Root command to add a changeset: `pnpm changeset`
- Root command used by the release pull request: `pnpm version-packages`
- Root command used by CI publication: `pnpm release`

The initial source version is `0.0.0`. The committed initial changeset bumps `@rivus/agent-task-loop` to `0.1.0` in the first release pull request.

### Package Contents

The npm tarball should contain only runtime-facing files:

- `LICENSE`
- `README.md`
- `bin/`
- `dist/`
- `skills/agent-task-loop-cli/`
- `package.json`

The package should not include source, tests, local config, generated logs, or workspace artifacts.

## Alternatives Considered

### Local npm Publish

Local publishing is simpler for the first release, but it is easier to use the wrong registry or credentials. It also makes release provenance less clear.

### Permanent npm Token in GitHub Secrets

A permanent token is easy to configure but creates a long-lived secret with publish rights. Trusted Publishing is safer once the package exists.

### Manual Version Bumps

Manual `pnpm version` or direct `package.json` edits are enough for one package, but they do not scale cleanly once the monorepo gains more packages. They also leave changelog discipline to humans.

Changesets adds a small amount of ceremony now in exchange for a consistent release path later.

### Project-Owned npm Scope

Using a scope such as `@agent-task-loop/cli` would make the npm namespace project-centered instead of maintainer-centered. This is a good future direction if the project gets an npm organization before the first publish.

The tradeoff is operational overhead: the organization must exist, ownership must be managed, and all package metadata, workflows, docs, and runbooks must change before the first release.

### Unscoped Package Name

Publishing as `agent-task-loop` would produce the shortest install command, but it gives up the namespace benefits of scoped packages. It is not recommended for this project.

## Release Procedure

For a patch release:

```bash
pnpm changeset
pnpm test
pnpm build
```

After the change lands on `main`, the Changesets action opens or updates the release pull request. Merging the release pull request triggers publication.

## Risks

- The first publish still needs a temporary token.
- A private GitHub repository can publish with Trusted Publishing, but npm provenance is only generated when both the package and repository are public.
- Re-running a publish for an already accepted version fails, so failed releases after upload require a version bump.
- Package-changing pull requests can miss changelog entries if maintainers forget to add a changeset.

## Rollout Plan

1. Merge package metadata, Changesets config, initial changeset, and publish workflow.
2. Create a temporary `NPM_TOKEN` secret in the GitHub Actions environment named `NPM_TOKEN`.
3. Let GitHub Actions open the initial Changesets release pull request.
4. Merge the release pull request to publish `@rivus/agent-task-loop@0.1.0`.
5. Confirm the npm package exists.
6. Configure npm Trusted Publishing.
7. Remove `NPM_TOKEN`.
8. Use OIDC for future releases.
