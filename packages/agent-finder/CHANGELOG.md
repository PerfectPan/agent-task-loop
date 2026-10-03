# @rivus/agent-finder-core

## 0.1.3

### Patch Changes

- [#125](https://github.com/PerfectPan/agent-task-loop/pull/125) [`c006fce`](https://github.com/PerfectPan/agent-task-loop/commit/c006fce5411fab9ed5e4d57bff87eacede40195d) Thanks [@PerfectPan](https://github.com/PerfectPan)! - License `@rivus/agent-finder-core` and the MoonBit module `PerfectPan/agent-finder` under MIT instead of GPL-3.0-only. The package now ships its own `LICENSE` file with the MIT text, and `THIRD_PARTY_NOTICES.md` with the Apache-2.0 license and NOTICE of the MoonBit standard library (`moonbitlang/core`) that its compiled JavaScript includes.

- [#130](https://github.com/PerfectPan/agent-task-loop/pull/130) [`68a1d1c`](https://github.com/PerfectPan/agent-task-loop/commit/68a1d1ce35b688a6b9a16fb16a77d2399925b69a) Thanks [@PerfectPan](https://github.com/PerfectPan)! - Build the published JavaScript with Rslib 1.0. The bundle changes form, not behavior.

## 0.1.2

### Patch Changes

- c7a99de: fix(build): emit a bundled `dist/index.d.ts` so consumers get real types

  The shared lib build used `dts: true`, which mirrors declarations into
  `dist/src/**` while the JS is bundled to `dist/index.js`. That left the
  `types: ./dist/index.d.ts` entry in package.json pointing at a missing file,
  so downstream packages resolved `@rivus/agent-finder-core` as `any` (TS7016).

  Switch the shared lib config to `dts: { bundle: true }` (adding the required
  `@microsoft/api-extractor`), producing a single `dist/index.d.ts` next to the
  bundled JS. Only the core library consumes this config; the CLI packages use
  `cliConfig` and are unaffected.

## 0.1.1

### Patch Changes

- 4272fb1: Replace tsup with rslib for all packages. Eliminate scripts/sync-moonbit-js.mjs by embedding MoonBit FFI sync into an rslib plugin. Add shared @rivus/rslib-config package.

## 0.1.0

### Minor Changes

- 22de691: Add the initial agent finder packages with a MoonBit discovery core, JavaScript wrapper, and CLI.
