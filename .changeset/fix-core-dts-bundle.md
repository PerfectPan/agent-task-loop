---
"@rivus/agent-finder-core": patch
---

fix(build): emit a bundled `dist/index.d.ts` so consumers get real types

The shared lib build used `dts: true`, which mirrors declarations into
`dist/src/**` while the JS is bundled to `dist/index.js`. That left the
`types: ./dist/index.d.ts` entry in package.json pointing at a missing file,
so downstream packages resolved `@rivus/agent-finder-core` as `any` (TS7016).

Switch the shared lib config to `dts: { bundle: true }` (adding the required
`@microsoft/api-extractor`), producing a single `dist/index.d.ts` next to the
bundled JS. Only the core library consumes this config; the CLI packages use
`cliConfig` and are unaffected.
