# npm Publish Runbook

This runbook describes how to publish `@rivus/agent-task-loop`.

## Preconditions

- GitHub repository: `PerfectPan/agent-task-loop`
- npm package: `@rivus/agent-task-loop`
- workflow file: `.github/workflows/publish.yml`
- public npm registry: `https://registry.npmjs.org`

## Scope Check

Confirm and reserve the npm package scope before the first publish.

The current implementation uses `@rivus/agent-task-loop`. `@rivus` is the selected personal npm namespace, while the GitHub repository remains `PerfectPan/agent-task-loop`.

Create or reserve the `rivus` npm owner before publishing `v0.1.0`. After the first publish, changing package scope means publishing a new package name and maintaining a migration path.

Run local validation before preparing a release:

```bash
pnpm test
pnpm build
```

Inspect npm package contents:

```bash
cd packages/agent-task-loop
npm pack --dry-run --registry=https://registry.npmjs.org
```

The tarball should contain only:

- `LICENSE`
- `README.md`
- `bin/`
- `dist/`
- `skills/agent-task-loop-cli/`
- `package.json`

## First Publish

Use a temporary npm token only for the first publish.

1. Create a granular npm token with publish access.
2. Add it to GitHub Actions secrets as `NPM_TOKEN`.
3. Create and push the first release tag:

```bash
git tag -s v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

4. Confirm the package exists on npm.
5. Delete the `NPM_TOKEN` secret.

## Trusted Publishing Setup

After the package exists, configure npm Trusted Publishing:

- Provider: GitHub Actions
- Owner: `PerfectPan`
- Repository: `agent-task-loop`
- Workflow filename: `publish.yml`

The owner above is the GitHub owner, not the npm scope.

Then remove token-based publishing from the steady-state workflow.

## Normal Release

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

The tag push triggers GitHub Actions publication.

## Failure Handling

- If CI fails before npm upload, fix the workflow or code and re-run the tag workflow.
- If npm accepted the version, do not publish the same version again. Bump the patch version.
- If a bad version is published, prefer `npm deprecate` and publish a fixed version.

## Safety Checks

- Never commit `.npmrc` with tokens.
- Confirm `publishConfig.registry` points to `https://registry.npmjs.org`.
- Confirm the package uses the scope selected by RFC 0001.
- Confirm generated files and local config are not included in the tarball.
