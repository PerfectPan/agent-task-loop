# Plan 0017: Rivus Plugin SDK Migration

- Status: accepted for implementation; registry validation pending
- Owner: repository maintainer
- Reviewer: unconfirmed
- Paired Spec: [0017-rivus-plugin-sdk.md](../specs/0017-rivus-plugin-sdk.md)

## 1. Background And Boundary

The consumer baseline uses `@rivus/agent` 0.16.6 for development and accepts
`>=0.1.1 <0.17.0` as an optional peer. Production imports and conformance use
the supported plugin SDK. The terminal test additionally constructs a general
callback runtime and artificial tool events, which Rivus 0.17 removes.

The migration follows Rivus's plugin product API. Production composition,
Task Manager application ownership, provider ports, tool input validation,
DTO redaction, and CLI behavior remain in their existing package boundaries.
No compatibility helper or new Runtime dependency is added.

## 2. Technical Decisions

### 2.1 Tool Verification

Rename the terminal test to `rivus-tool-execution.test.ts`. Register the real
plugin with an injected `createTaskManagerApplication`, use a fake TaskProvider,
retrieve the task-get descriptor from the registry, and call its executor with
real input and a `RivusToolExecutionContext`. Assert the exact DTO and absence
of private fields. Check the deployment grant through the supported
`assertRivusPluginConforms` testkit; authorization belongs to the host, so the
executor test does not invent a second authorization layer.

### 2.2 Support And Release Order

Set the optional peer to `>=0.17.0 <0.18.0`, the default package smoke to exact
Core 0.17.0, and the installation example to that version. Replace the
unreleased peer-widening change entry with a minor Changeset describing the
new support range.

Keep the committed dev dependency and lockfile at their baseline until all
four actual Core 0.17.0 packages are published. Configure the authorized
`minimumReleaseAgeExclude: ['@rivus/*']` in `pnpm-workspace.yaml`, retaining
`minimumReleaseAge: 1440` for every other dependency, including transitive
packages outside that scope. An intermediate mismatch is pending migration,
not a completed normal gate. Resolve the final dev dependency with the public
registry; do not hand-author registry lock entries, widen the exclusion, or
disable the release-age check globally.

### 2.3 Four-Archive Consumer Check

`RIVUS_CORE_ARCHIVES_JSON` accepts a JSON array of exactly four archive paths,
one for each Core package. It is mutually exclusive with `RIVUS_CORE_PACKAGE`.
The checker reads each tarball's manifest and computes SHA-256 and npm's
SHA-512 integrity before installation. Names must be unique and complete;
versions must agree and fit the new support minor.

Install the plugin, all four archives, and the existing TypeScript compiler in
one npm command using the public registry, ignored build scripts, and an npm
lockfile. Inspect every installed Core manifest and every Core occurrence in
the lockfile. Each must come from the corresponding archive and have its exact
integrity. Resolve the packages from the consumer and from each installed Core
owner to catch a nested registry copy. Recheck archive hashes after installation
and report package name, version, and SHA-256 without persisting local paths.

The archive reader and provenance verifier live in a small script module next
to the package driver so Node regression tests can exercise failure boundaries
without network installs. They use Node built-ins and the host tar tool;
no published package dependency is added.

The CLI consumer continues to install without Core. Archive and registry modes
both retain plugin import, conformance, and downstream TypeScript checks.
Every nested pnpm command and npm install explicitly selects the public
registry. Temporary consumers are removed on success and failure.

## 3. Failures And Rollback

Reject invalid archive input before packing or installing. A changed archive,
manifest mismatch, different lock source, different integrity, or unexpected
module resolution fails the check. Never use force or legacy-peer flags to
turn an unsupported Core installation into acceptance evidence.

The migration changes no persisted task data. Before consumer release, revert
the support metadata, tests, checker, and docs together if the migration is
cancelled. After release, a correction uses a new version; an archive pass does
not authorize publishing or replacing registry versions.

## 4. Execution And Completion

1. Review this authorized scope and the existing package boundaries.
2. Rewrite the tool test, support metadata, documentation, and minor Changeset.
3. Implement archive intake and provenance checks; add targeted Node failure
   regressions and run them locally.
4. With actual four-package artifacts, run archive package smoke and complete
   build/typecheck/test in an isolated temporary binding. Keep artifact paths
   out of the deliverable.
5. After registry availability, apply the scoped Rivus release-age exemption,
   update dev/lock to 0.17.0 and run all normal gates plus the default and
   explicit Core package smoke.
6. Review documentation impact, package contents, and final diff; keep the
   consumer PR draft while registry gates are pending. Commit, push, review,
   and publication are coordinated after upstream Rivus validation.

| Scenario | Command Or Evidence                                                                                                                                                                                     | Completion Condition                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| S1       | Tool execution and existing plugin suites                                                                                                                                                               | Exact public DTO, narrowed grant, rejected undeclared tool                 |
| S3       | `node --test tests/scripts/rivus-core-archives.test.mjs`                                                                                                                                                | Archive input and source substitution regressions pass                     |
| S2/S3    | `RIVUS_CORE_ARCHIVES_JSON='["<platform-archive>","<runtime-archive>","<gateway-archive>","<agent-archive>"]' pnpm --registry https://registry.npmjs.org/ --filter @rivus/agent-task-loop package:check` | All four supplied archives verified and consumer checks pass               |
| S4       | `pnpm --registry https://registry.npmjs.org/ install --frozen-lockfile`                                                                                                                                 | Public registry dev/lock is reproducible with only Rivus packages exempted |
| S4       | `pnpm --registry https://registry.npmjs.org/ format:check`, `check:moonbit-version`, `test`, `build`, `typecheck`, `lint`                                                                               | Every required gate passes for final dependency state                      |
| S4       | `pnpm --registry https://registry.npmjs.org/ changeset status`                                                                                                                                          | Minor package release intent present                                       |
| S2/S4    | `pnpm --registry https://registry.npmjs.org/ --filter @rivus/agent-task-loop package:check`, repeated with `RIVUS_CORE_PACKAGE=@rivus/agent@0.17.0`                                                     | Supported registry consumers pass                                          |
| S4       | `npm pack --dry-run --registry=https://registry.npmjs.org` in the changed package; `gh repo-checks repository`                                                                                          | Package file list and repository checks pass                               |

The Spec and Plan remain active until registry validation and consumer delivery
finish. Lasting support and archive-operation rules belong in the package's
current plugin documentation before these records are retired.
