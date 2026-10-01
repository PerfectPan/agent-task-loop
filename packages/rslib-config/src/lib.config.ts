export const libConfig = {
  // Bundle the declarations into a single `dist/index.d.ts` alongside the
  // bundled `dist/index.js`, so the `types` path in each package.json resolves.
  // Plain `dts: true` mirrors the source tree into `dist/src/**`, which leaves
  // `dist/index.d.ts` missing and downstream packages falling back to `any`.
  lib: [{ format: 'esm' as const, dts: { bundle: true }, bundle: true }],
  output: { target: 'node' as const },
  // Rsbuild 2's persistent build cache also stores failed module resolutions:
  // a package built before its workspace dependencies keeps failing with
  // "Can't resolve" after they are built, until node_modules/.cache is deleted.
  // These builds take seconds, so they run without it.
  performance: { buildCache: false },
};
