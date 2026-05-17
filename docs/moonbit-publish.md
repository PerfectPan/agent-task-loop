# MoonBit Publish Runbook

This runbook describes how to publish the primary MoonBit module `PerfectPan/agent-finder`.

## Release Shape

- MoonBit module: `PerfectPan/agent-finder`
- Manifest: `packages/agent-finder/moon.mod.json`
- Registry: mooncakes.io
- npm wrappers: `@rivus/agent-finder-core` and `@rivus/agent-finder-cli`

The MoonBit module is the primary implementation package. The npm packages are JavaScript distribution surfaces that embed the generated MoonBit JavaScript bridge.

## CI Flow

The publish workflow installs MoonBit before running repository validation. On every publish workflow run it packages the MoonBit module:

```bash
moon -C packages/agent-finder package
```

MoonBit publish follows the common MoonBit GitHub Actions pattern used by upstream MoonBit packages: publish from a GitHub Release, install the MoonBit toolchain, validate all targets, write the mooncakes credential secret to `$HOME/.moon/credentials.json`, then run `moon publish`.

The dedicated MoonBit publish workflow runs on `release: released`, `workflow_dispatch`, and `workflow_call`. The reusable `workflow_call` entry point lets the npm publish workflow publish the MoonBit module automatically after Changesets successfully publishes npm packages.

The workflow follows the upstream workflow shape used by MoonBit packages:

```bash
moon -C packages/agent-finder fmt
git diff --exit-code -- packages/agent-finder
moon -C packages/agent-finder check --target all
moon -C packages/agent-finder test --target all
moon -C packages/agent-finder package
moon -C packages/agent-finder publish
```

The npm publish workflow still installs MoonBit and runs `moon -C packages/agent-finder package` as a packaging preflight. npm publishing remains managed by Changesets. When `pnpm release` succeeds, the npm workflow calls `.github/workflows/moonbit-publish.yml` with inherited secrets so the matching MoonBit package is published in the same release flow.

## Credentials

Create the mooncakes.io credentials locally with:

```bash
moon login
```

Then store the contents of `$HOME/.moon/credentials.json` as a GitHub Actions secret named `MOONCAKES_PERFECTPAN_TOKEN`.

Do not commit `credentials.json`.

## Versioning

MoonBit uses `packages/agent-finder/moon.mod.json` as its version source. Bump that version for every MoonBit package release.

The npm wrappers use Changesets. For this initial release, the source package versions stay at `0.0.0` and the changeset bumps them to `0.1.0` in the release pull request.
