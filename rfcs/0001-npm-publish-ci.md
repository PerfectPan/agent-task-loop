# RFC 0001: npm Publishing Through GitHub Actions

## Status

Proposed

## Summary

Publish `@perfectpan/agent-task-loop` from GitHub Actions instead of local machines. Use a temporary npm token only for the first package bootstrap, then switch to npm Trusted Publishing with GitHub Actions OIDC.

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
- Keep `@perfectpan/agent-task-loop` as the npm package identity.
- Use `v*` tags as the normal release trigger.
- Keep npm package contents narrow.
- Remove long-lived npm tokens after the first publish.

## Non-Goals

- Introduce a multi-package release manager before there is more than one published package.
- Automate changelog generation in the first release.
- Support publishing from local developer machines as a normal path.

## Proposed Design

### Package Identity

- Package: `@perfectpan/agent-task-loop`
- Binary: `agent-task-loop`
- Registry: `https://registry.npmjs.org`
- Access: public
- License: `GPL-3.0-only`

The package should remain scoped. The scope reserves room for future monorepo packages and avoids depending on the global npm namespace.

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
- build `@perfectpan/agent-task-loop`
- publish from `packages/agent-task-loop`

`workflow_dispatch` can stay as a recovery mechanism, but tags should be the normal release path.

### Authentication

The first publish uses a temporary granular npm token stored as `NPM_TOKEN`.

After `@perfectpan/agent-task-loop@0.1.0` exists on npm, configure npm Trusted Publishing for:

- Provider: GitHub Actions
- Owner: `PerfectPan`
- Repository: `agent-task-loop`
- Workflow filename: `publish.yml`

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

## Release Procedure

For a patch release:

```bash
pnpm --filter @perfectpan/agent-task-loop version patch --no-git-tag-version
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
