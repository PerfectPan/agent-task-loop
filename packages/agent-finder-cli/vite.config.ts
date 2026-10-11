import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    // dist/cli.js matches the `exports` path in package.json and the `bin`
    // entry point.
    entry: { cli: 'src/cli.ts' },
    format: 'esm',
    platform: 'node',
    // One bundled declaration (dist/cli.d.ts).
    dts: true,
    // tsdown defaults to unambiguous `.mjs`/`.d.mts` names on the node
    // platform; pin plain `.js`/`.d.ts` so the `exports` paths in package.json
    // and the `bin` entry point keep resolving.
    fixedExtension: false,
    deps: {
      // ink resolves its optional devtools peer through
      // `import.meta.resolve('react-devtools-core')`; the package is not an
      // installed dependency, so keep it external.
      neverBundle: ['react-devtools-core'],
    },
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10000,
  },
});
