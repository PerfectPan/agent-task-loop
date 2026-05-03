# npm Publish Runbook

This runbook describes how to publish `@rivus/agent-task-loop`.

## Preconditions

- GitHub repository: `PerfectPan/agent-task-loop`
- npm package: `@rivus/agent-task-loop`
- workflow file: `.github/workflows/publish.yml`
- public npm registry: `https://registry.npmjs.org`
- release manager: Changesets

## Scope Check

Confirm and reserve the npm package scope before the first publish.

The current implementation uses `@rivus/agent-task-loop`. `@rivus` is the selected personal npm namespace, while the GitHub repository remains `PerfectPan/agent-task-loop`.

Create or reserve the `rivus` npm owner before publishing `v0.1.0`. After the first publish, changing package scope means publishing a new package name and maintaining a migration path.

Run local validation before preparing a release:

```bash
pnpm test
pnpm build
pnpm changeset status
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

Use a temporary npm token only for the first publish. The package starts at `0.0.0` in source and uses `.changeset/initial-release.md` to create the `0.1.0` release pull request.

1. Create a granular npm token with publish access.
2. Add it to the GitHub Actions environment `NPM_TOKEN` as a secret named `NPM_TOKEN`.
3. Merge the setup pull request to `main`.
4. Wait for GitHub Actions to open the Changesets release pull request.
5. Review that the release pull request bumps `@rivus/agent-task-loop` to `0.1.0` and creates a changelog entry.
6. Merge the release pull request.
7. Confirm the package exists on npm.
8. Delete the environment `NPM_TOKEN` secret after Trusted Publishing is configured.

## Trusted Publishing Setup

After the package exists, configure npm Trusted Publishing:

- Provider: GitHub Actions
- Owner: `PerfectPan`
- Repository: `agent-task-loop`
- Workflow filename: `publish.yml`

The owner above is the GitHub owner, not the npm scope.

Then remove the environment `NPM_TOKEN` secret. The workflow keeps the bootstrap-token step conditional and publishes through OIDC when no token secret is present.

## Normal Release

For a package-changing pull request:

```bash
pnpm changeset
pnpm test
pnpm build
```

After the pull request lands on `main`, GitHub Actions opens or updates a release pull request. Merging that release pull request runs `pnpm release`, which builds the package and publishes unpublished package versions through Changesets.

## Failure Handling

- If CI fails before npm upload, fix the workflow or code and re-run the publish workflow.
- If npm accepted the version, do not publish the same version again. Bump the patch version.
- If a bad version is published, prefer `npm deprecate` and publish a fixed version.

## Safety Checks

- Never commit `.npmrc` with tokens.
- Confirm `publishConfig.registry` points to `https://registry.npmjs.org`.
- Confirm the package uses the scope selected by RFC 0001.
- Confirm package-changing pull requests include a changeset.
- Confirm generated files and local config are not included in the tarball.
