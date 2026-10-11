import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    // dist/<name>.js matches the `exports` and `bin` paths in package.json.
    entry: {
      cli: 'src/cli.ts',
      'rivus-plugin': 'src/rivus-plugin.ts',
      'task-delivery': 'src/task-delivery.ts',
      'task-management': 'src/task-management.ts',
    },
    format: 'esm',
    platform: 'node',
    // tsdown pins fixedExtension to true on the node platform, which would
    // rename every entry to `.mjs`; package.json exports and bin point at
    // `dist/<name>.js`, so keep the package-type-driven extension instead.
    fixedExtension: false,
    // Bundled per-entry declarations (dist/<name>.d.ts).
    dts: true,
    deps: {
      // ink resolves its optional devtools peer through
      // `import.meta.resolve('react-devtools-core')`; the package is not an
      // installed dependency, so keep it external.
      neverBundle: ['react-devtools-core'],
    },
  },
});
