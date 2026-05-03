# RFC 0001: npm Publishing Through GitHub Actions

## Status

Proposed

## Summary

Publish a scoped Agent Task Loop package from GitHub Actions instead of local machines. Use a temporary npm token only for the first package bootstrap, then switch to npm Trusted Publishing with GitHub Actions OIDC.

## Motivation

Publishing from a local machine makes releases harder to audit and easier to misconfigure. The project already has CI, a scoped package name, and a narrow npm package file list, so release automation should be handled in the same place as validation.

CI publishing gives the project:

- repeatable release steps
- centralized permissions
- short-lived credentials after Trusted Publishing is configured
- a clear tag-based release event
- a smaller chance of accidentally publishing to the wrong registry

## Goals

- Publish the package from GitHub Actions.
- Keep the npm package scoped.
- Treat the exact npm scope as a pre-first-publish decision.
- Use `v*` tags as the normal release trigger.
- Keep npm package contents narrow.
- Remove long-lived npm tokens after the first publish.

## Non-Goals

- Introduce a multi-package release manager before there is more than one published package.
- Automate changelog generation in the first release.
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

The publish workflow runs on `v*` tags:

- checkout the tagged commit
- install dependencies with public npm registry configured
- run tests
- build the publishable package
- publish from `packages/agent-task-loop`

`workflow_dispatch` can stay as a recovery mechanism, but tags should be the normal release path.

### Authentication

The first publish uses a temporary granular npm token stored as `NPM_TOKEN`.

After `@rivus/agent-task-loop@0.1.0` exists on npm, configure npm Trusted Publishing for:

- Provider: GitHub Actions
- Owner: `PerfectPan`
- Repository: `agent-task-loop`
- Workflow filename: `publish.yml`

The owner above is the GitHub owner, not the npm scope.

After Trusted Publishing is configured, remove the `NPM_TOKEN` secret and publish through OIDC.

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

### Changesets Immediately

Changesets is useful for multi-package versioning. It is unnecessary until the monorepo has more than one published package.

### Project-Owned npm Scope

Using a scope such as `@agent-task-loop/cli` would make the npm namespace project-centered instead of maintainer-centered. This is a good future direction if the project gets an npm organization before the first publish.

The tradeoff is operational overhead: the organization must exist, ownership must be managed, and all package metadata, workflows, docs, and runbooks must change before the first tag.

### Unscoped Package Name

Publishing as `agent-task-loop` would produce the shortest install command, but it gives up the namespace benefits of scoped packages. It is not recommended for this project.

## Release Procedure

For a patch release:

```bash
pnpm --filter @rivus/agent-task-loop version patch --no-git-tag-version
pnpm install --lockfile-only
pnpm test
pnpm build
git add package.json pnpm-lock.yaml packages/agent-task-loop/package.json
git commit -S -m "chore: release vX.Y.Z"
git tag -s vX.Y.Z -m "vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

The tag push triggers publication.

## Risks

- The first publish still needs a temporary token.
- A private GitHub repository can publish with Trusted Publishing, but npm provenance is only generated when both the package and repository are public.
- Re-running a publish for an already accepted version fails, so failed releases after upload require a version bump.

## Rollout Plan

1. Merge package metadata and publish workflow.
2. Create a temporary `NPM_TOKEN` GitHub secret.
3. Push `v0.1.0`.
4. Confirm the npm package exists.
5. Configure npm Trusted Publishing.
6. Remove `NPM_TOKEN`.
7. Use OIDC for future releases.
