# Spec 0017: Rivus Plugin SDK Support

## Status

Accepted for implementation. Registry validation and release remain pending.

Paired Plan: [0017-rivus-plugin-sdk.md](../plans/0017-rivus-plugin-sdk.md).

## Problem And Scope

Rivus 0.17 removes its general callback runtime and tool event helpers from the
Agent package. Agent Task Loop must use the supported plugin SDK and declare
the supported Core minor explicitly. Maintainers also need a clean consumer
check against all four unpublished Core archives before registry validation.

This change covers the plugin's supported dependency range, tool boundary
tests, clean consumer verification, and package documentation. Task lifecycle,
provider behavior, CLI commands, and deployment state keep their existing
behavior.

## Behavioral Requirements

- Plugin projects explicitly install `@rivus/agent` in `>=0.17.0 <0.18.0`.
- A CLI-only installation does not install the optional Rivus Core peer.
- The Task Manager plugin keeps its four exact tool registrations and bounded
  application API. Task queries expose public task data and hide private
  execution and provider fields.
- The package check can validate four local Core archives together. It rejects
  incomplete, duplicated, mismatched, or registry-substituted Core artifacts.
- Archive evidence and supported registry evidence are reported separately.
  Published `@rivus/*` packages are exempt from the repository's 24-hour
  minimum release age; other dependencies retain it.

## Acceptance Examples

### S1: Query Through The Supported SDK

- Given a plugin backed by a real Task Manager application and a fake provider
  returning both public and private fields,
- When the registered task-get executor receives valid task input and a tool
  execution context,
- Then the provider receives that task ID and the result contains only the
  allowlisted public DTO.
- Given a deployment granting only task-get,
- When plugin conformance checks the deployment,
- Then the reported tool grant contains only task-get; an undeclared tool grant
  is rejected before provider access.

### S2: Clean Consumers

- Given a packed Agent Task Loop package,
- When a clean CLI consumer installs it without Core,
- Then the CLI runs and `@rivus/agent` is absent.
- When a clean plugin consumer installs supported Core,
- Then plugin import, conformance, and downstream TypeScript compilation pass.

### S3: Complete Local Core Artifacts

- Given exactly one archive each for `@rivus/platform`, `@rivus/runtime`,
  `@rivus/gateway`, and `@rivus/agent` from the same supported version,
- When the clean consumer check installs them,
- Then all four install in the same operation and installed manifests, npm lock
  sources and integrity, module resolution, and archive hashes match the
  supplied artifacts.
- Given a missing, repeated, mixed-version, changed, or substituted artifact,
- When validation runs,
- Then it fails with an actionable error.

### S4: Registry Completion

- Given all four Core 0.17.0 packages are published and the repository exempts
  only `@rivus/*` from its minimum release age,
- When the dev dependency and lockfile are updated through the public registry,
- Then the full repository gates and default registry package smoke pass.
- Before that condition, archive passes do not imply registry completion.
- Dependencies outside `@rivus/*`, including transitive dependencies, keep the
  24-hour minimum release age.

## Compatibility And Constraints

- The plugin peer remains optional. Rivus versions before 0.17 are outside the
  supported range.
- Tool IDs, validated inputs, public results, and task persistence do not change.
- No callback runtime, event helper, or Runtime package API is required by the
  plugin consumer.
- Temporary archive paths and lockfiles do not enter commits or npm packages.

## Acceptance Evidence

- S1: `packages/agent-task-loop/tests/rivus-tool-execution.test.ts` and the
  existing plugin conformance and tool input suites.
- S2/S3: `packages/agent-task-loop/scripts/check-package.mjs`; archive source
  regressions in `tests/scripts/rivus-core-archives.test.mjs`.
- S4: complete repository gates, Changesets status, pack inspection, and both
  default and explicit Core 0.17.0 clean-consumer runs after publication.
