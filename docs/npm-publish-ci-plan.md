# npm Publish CI Plan

## Goal

Publish `@perfectpan/agent-task-loop` from GitHub Actions with a repeatable, auditable release path. Local machines should only prepare release commits and tags; the actual `npm publish` should happen in CI.

## Recommended Direction

Use GitHub Actions as the only publish surface, with npm Trusted Publishing as the steady-state authentication model.

This gives us short-lived OIDC credentials, avoids storing long-lived npm write tokens, and lets npm attach provenance when the package is public and the GitHub repository is public.

The first publish is the only exception: npm trusted publisher configuration is tied to an existing package, so bootstrap the initial `0.1.0` publish with a temporary npm token, then remove that token and switch to OIDC-only publishing.

## Package Identity

- Package name: `@perfectpan/agent-task-loop`
- CLI binary: `agent-task-loop`
- Registry: `https://registry.npmjs.org`
- Access: public
- License: `GPL-3.0-only`
- Source repository: `https://github.com/PerfectPan/agent-task-loop`

Keeping the npm package scoped leaves room for future monorepo packages without competing in the global npm namespace.

## CI Workflows

### CI

Run on pull requests and pushes to `main`.

Required checks:

- install with `pnpm install --frozen-lockfile`
- run `pnpm test`
- run `pnpm build`

### Publish

Run on version tags matching `v*`.

Required publish steps:

- checkout the exact tagged commit
- install with public npm registry configured
- run tests
- build `@perfectpan/agent-task-loop`
- publish from `packages/agent-task-loop`

`workflow_dispatch` can stay available for recovery, but tag publishing should be the normal path. Re-running publish for an already published version will fail on npm, which is useful protection against accidental overwrites.

## Authentication Plan

### Phase 1: Bootstrap First Publish

Use a temporary granular npm token stored as `NPM_TOKEN` in GitHub Actions secrets.

The token should be scoped as narrowly as npm allows and should be deleted immediately after `@perfectpan/agent-task-loop@0.1.0` is published.

Bootstrap steps:

1. Confirm public npm package name availability.
2. Add temporary `NPM_TOKEN` to GitHub repository secrets.
3. Push `v0.1.0`.
4. Confirm npm package page exists.
5. Delete `NPM_TOKEN`.

### Phase 2: Trusted Publishing

Configure npm trusted publishing for:

- Package: `@perfectpan/agent-task-loop`
- Provider: GitHub Actions
- Owner: `PerfectPan`
- Repository: `agent-task-loop`
- Workflow filename: `publish.yml`

After this is configured, the publish workflow should not require `NODE_AUTH_TOKEN`.

If an environment is added later, the same environment name must be configured both in GitHub Actions and npm trusted publishing.

## Package Contents

The npm tarball should contain only runtime-facing files:

- `LICENSE`
- `README.md`
- `bin/`
- `dist/`
- `skills/agent-task-loop-cli/`
- `package.json`

The package should not publish source, tests, local config, generated logs, or workspace artifacts. The `files` field in `packages/agent-task-loop/package.json` is the source of truth.

Before each release, CI should effectively prove:

- `pnpm test` passes
- `pnpm --filter @perfectpan/agent-task-loop build` passes
- `npm pack --dry-run` contains only the intended files

## Release Procedure

For a normal patch release:

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

The tag push triggers npm publication.

For multi-package release management later, introduce Changesets once there is more than one publishable package.

## Repository Visibility

Trusted Publishing works for private repositories, but npm provenance is only generated when the GitHub repository is public and the package is public.

If provenance matters for the first public release, make the GitHub repository public before publishing.

## Security Guardrails

- Never commit `.npmrc` with tokens.
- Keep `publishConfig.registry` pinned to public npm.
- Keep GitHub Actions permissions minimal: `contents: read` and `id-token: write` only for publish.
- Protect `main`.
- Restrict who can create `v*` tags.
- Prefer a protected GitHub environment before publishing once the project has more contributors.
- Remove bootstrap npm tokens immediately after OIDC is configured.

## Failure Handling

- If publish fails before upload, fix the workflow and re-run the same tag.
- If npm accepted the version, never try to republish the same version. Bump to a new patch version.
- If a bad version is published, prefer `npm deprecate` and publish a fixed version. Only use `npm unpublish` inside npm's narrow allowed window and when the package has not been adopted.

## Current Branch Scope

This branch records the release plan. The current package metadata and GitHub Actions workflows already cover the core mechanics; the remaining work before the first production publish is npm-side setup, repository visibility decision, and the actual release tag.
