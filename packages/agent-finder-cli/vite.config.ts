import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    // Same entry map as the previous rslib.config.ts, so dist/cli.js keeps
    // matching the `exports` path in package.json and the `bin` entry point.
    entry: { cli: 'src/cli.ts' },
    format: 'esm',
    platform: 'node',
    // One bundled declaration (dist/cli.d.ts), like rslib's
    // `dts: { bundle: true }` did.
    dts: true,
    // tsdown defaults to unambiguous `.mjs`/`.d.mts` names on the node
    // platform; pin plain `.js`/`.d.ts` so the `exports` paths in package.json
    // and the `bin` entry point keep resolving.
    fixedExtension: false,
    deps: {
      // ink resolves its optional devtools peer through
      // `import.meta.resolve('react-devtools-core')`; the package is not an
      // installed dependency, so keep it external exactly like the rslib build.
      neverBundle: ['react-devtools-core'],
    },
  },
});
