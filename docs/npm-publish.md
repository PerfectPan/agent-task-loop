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

After the pull request lands on `main`, GitHub Actions opens or updates the release pull request `chore(release): version packages` on the branch `changeset-release/main`. It runs `pnpm version-packages`: Changesets bumps published packages and writes changelog entries through `@changesets/changelog-github`. Private workspace packages are not versioned.

The release pull request is opened with the workflow's `GITHUB_TOKEN`. GitHub can require an authorized
maintainer to select **Approve workflows to run** for PR events created by that token; see
[GitHub's trigger behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow).
Changesets returns the release PR to Draft whenever it updates the version commit. Mark the reviewed head Ready for review to start full CI. To retry a failed release, dispatch the publish workflow on `main`.

Confirm that the full `test` job actually ran and passed for the current head and merge result, alongside the
lightweight Review checks, before merging. A skipped Draft job is not test evidence. The CI workflow has no
manual dispatch trigger. See [CI Execution Policy](../CONTRIBUTING.md#ci-execution-policy) for the shared
Ready/Draft behavior; the existing publishing process is unchanged.

Merging the release pull request runs `pnpm release`, which runs the workspace tests, build and typecheck, then publishes unpublished package versions through Changesets. Changesets runs `pnpm publish`, which authenticates through npm trusted publishing (OIDC) and attaches provenance itself because the repository and the packages are public.

Preview a release locally without committing the result:

```bash
pnpm changeset status --verbose
pnpm exec changeset publish-plan
```

## Failure Handling

- If CI fails before npm upload, fix the workflow or code and re-run the publish workflow.
- If npm accepted the version, do not publish the same version again. Bump the patch version.
- If a bad version is published, prefer `npm deprecate` and publish a fixed version.

## Safety Checks

- Never commit `.npmrc` with tokens.
- Confirm `publishConfig.registry` points to `https://registry.npmjs.org`.
- Confirm the package uses the `@rivus` scope.
- Confirm package-changing pull requests include a changeset.
- Confirm generated files and local config are not included in the tarball.
