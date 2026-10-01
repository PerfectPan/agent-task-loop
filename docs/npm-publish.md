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

After the pull request lands on `main`, GitHub Actions opens or updates the release pull request `chore(release): version packages` on the branch `changeset-release/main`. It runs `pnpm version-packages`: Changesets bumps published packages and writes changelog entries through `@changesets/changelog-github`, then `pnpm sync:moonbit-version` copies the `@rivus/agent-finder-core` version into `packages/agent-finder/moon.mod.json`. Private workspace packages are not versioned.

The release pull request is opened with the workflow's `GITHUB_TOKEN`. GitHub does not start workflows for events caused by that token, so CI does not run on the release pull request by itself. Before merging, close and reopen it as a person, or push an empty commit to its branch:

```bash
gh pr close <n> && gh pr reopen <n>
```

That is a normal `pull_request` event, so `CI` and `Review` run. `gh workflow run ci.yml` does not help: a dispatched run is not attached to the pull request and does not satisfy required checks.

Merging the release pull request runs `pnpm release`, which builds the packages and publishes unpublished package versions through Changesets. Changesets runs `pnpm publish`, which authenticates through npm trusted publishing (OIDC) and attaches provenance itself because the repository and the packages are public. If npm publish succeeds, the workflow then calls the reusable MoonBit publish workflow so `PerfectPan/agent-finder` is published to mooncakes.io from the same release flow.

Preview a release locally without committing the result:

```bash
pnpm changeset status --verbose
pnpm exec changeset publish-plan
```

## Failure Handling

- If CI fails before npm upload, fix the workflow or code and re-run the publish workflow.
- If npm accepted the version, do not publish the same version again. Bump the patch version.
- If npm publish succeeds but MoonBit publish fails, re-run the `Publish MoonBit Package` workflow manually after fixing the MoonBit workflow, credentials, or package metadata issue.
- If a bad version is published, prefer `npm deprecate` and publish a fixed version.

## Safety Checks

- Never commit `.npmrc` with tokens.
- Confirm `publishConfig.registry` points to `https://registry.npmjs.org`.
- Confirm the package uses the `@rivus` scope.
- Confirm package-changing pull requests include a changeset.
- Confirm generated files and local config are not included in the tarball.
