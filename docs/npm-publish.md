# npm Publish Runbook

This runbook describes how to publish `@rivus/agent-task-loop`.

## Preconditions

- GitHub repository: `PerfectPan/agent-task-loop`
- npm packages: `@rivus/agent-task-loop`, `@rivus/agent-finder-cli`
- workflow file: `.github/workflows/publish.yml`
- public npm registry: `https://registry.npmjs.org`
- release manager: Changesets, through the shared workflow `PerfectPan/gh-repo-checks/.github/workflows/npm-release.yml@v1`; its [runbook](https://github.com/PerfectPan/gh-repo-checks/blob/v1/docs/npm-release.md) describes the jobs and their recovery

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

`@rivus/agent-task-loop` and `@rivus/agent-finder-cli` are both on npm. A new public package name needs a placeholder
publish before its first release, because Trusted Publishing cannot create a name; the shared workflow's
first-publish check stops before a version pull request names it. Follow First publish in the
[shared runbook](https://github.com/PerfectPan/gh-repo-checks/blob/v1/docs/npm-release.md).

## Trusted Publishing Setup

Each published package has its own trusted publisher:

- Provider: GitHub Actions
- Owner: `PerfectPan`
- Repository: `agent-task-loop`
- Workflow filename: `publish.yml`
- Direct publishing ("Allow npm publish") enabled

The owner above is the GitHub owner, not the npm scope. npm validates this calling workflow's file name, not the
shared workflow it calls.

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

Merging the release pull request runs the shared workflow in `publish` mode. A read-only job runs the gates this repository passes as `check-command` (`pnpm test && pnpm build && pnpm typecheck`) and `pnpm --filter '!./apps/**' audit --prod --audit-level=high` (the private apps never reach npm), then packs each unpublished version. The publish job, the only one with the OIDC permission, installs without lifecycle scripts and publishes the packed tarballs through Changesets: npm trusted publishing (OIDC) authenticates and attaches provenance because the repository and the packages are public.

Preview a release locally without committing the result:

```bash
pnpm changeset status --verbose
pnpm exec changeset publish-plan
```

## Failure Handling

- If CI fails before npm upload, fix the workflow or code and re-run the publish workflow. The shared runbook lists the recovery for each job.
- If npm accepted the version, do not publish it again and do not bump the version to retry: re-run the failed run, which skips versions already on npm, or fix forward through the next version pull request.
- If a bad version is published, prefer `npm deprecate` and publish a fixed version.

## Safety Checks

- Never commit `.npmrc` with tokens.
- Confirm `publishConfig.registry` points to `https://registry.npmjs.org`.
- Confirm the package uses the `@rivus` scope.
- Confirm package-changing pull requests include a changeset.
- Confirm generated files and local config are not included in the tarball.
