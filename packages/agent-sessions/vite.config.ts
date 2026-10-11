import { defineConfig } from 'vite-plus';

// One ESM entry bundled into `dist/index.js`, with declarations bundled into a
// single `dist/index.d.ts` so the `types` path in package.json resolves.
export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'node',
    dts: true,
    // Pin the extensions to the ones the package.json exports field points at
    // (`./dist/index.js` / `./dist/index.d.ts`); tsdown 0.23 otherwise emits
    // `.mjs` / `.d.mts` even for a `"type": "module"` package.
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
