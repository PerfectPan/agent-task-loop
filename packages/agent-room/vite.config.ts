import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    // Same shape as the old rslib config: one bundled ESM `dist/index.js` plus
    // one bundled `dist/index.d.ts` for Node, matching the `exports` paths in
    // package.json. `vp pack` (tsdown) defaults to unambiguous `.mjs`/`.d.mts`
    // names, so pin `fixedExtension: false` to keep the package.json paths.
    entry: ['src/index.ts'],
    format: 'esm',
    dts: true,
    platform: 'node',
    fixedExtension: false,
  },
});
