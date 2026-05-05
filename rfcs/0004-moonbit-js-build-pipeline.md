# RFC 0004: Modernize MoonBit → JS Build Pipeline

## Status

Proposed

## Summary

Replace the manual `scripts/sync-moonbit-js.mjs` script with a build-tool-native MoonBit → JS bridge, and upgrade `tsup` to `rslib` across all three npm packages.

## Motivation

`packages/agent-finder` currently bridges MoonBit and TypeScript through a custom script:

1. `moon build --target js` → `_build/js/debug/build/agent_discovery_core/`
2. `node scripts/sync-moonbit-js.mjs` → copies `.js` / `.d.ts` into `src/moonbit/`
3. `tsup src/index.ts` → bundles TypeScript + MoonBit output

The sync script is manual glue that should be part of the build pipeline, not a separate file. The MoonBit community uses `vite-plugin-moonbit` (dev) or `bun build` (production) for this — we need the library-building equivalent.

Additionally, `tsup` is mature but `rslib` (Rsbuild's library mode) offers better tree-shaking, format control, and lifecycle hooks that can replace the sync script naturally.

## Goals

- Eliminate `scripts/sync-moonbit-js.mjs`
- Make MoonBit FFI resolution a first-class part of the build tooling
- Replace `tsup` with `rslib` in all three packages (`agent-finder-core`, `agent-finder-cli`, `agent-task-loop`)
- Keep all existing entry points, type exports, and test behavior intact

## Non-Goals

- Change the MoonBit module structure or mooncakes publishing
- Rewrite TypeScript wrappers
- Change CLI behavior

## Proposed Design

### Option A: Direct import from `_build/` (Recommended)

TypeScript imports MoonBit output directly from the build directory, eliminating the copy step entirely.

**Before (`src/infrastructure/moonbit-api.ts`):**
```ts
import { scan_json } from "../moonbit/agent_discovery_core.js";
```

**After:**
```ts
// MoonBit JS backend output, resolved at build time via rslib alias
import { scan_json } from "@agent-finder-core/moonbit/agent_discovery_core.js";
```

**rslib config (`rslib.config.ts`):**
```ts
import { defineConfig } from "@rslib/core";

export default defineConfig({
  source: { entry: { index: "src/index.ts" } },
  resolve: {
    alias: {
      "@agent-finder-core/moonbit": "./_build/js/debug/build/agent_discovery_core"
    }
  },
  tools: {
    rspack: {
      // MoonBit output is already bundled, skip it
      externals: [],
    }
  },
  // Auto-run moon build before bundling
  plugins: [
    {
      name: "moonbit",
      setup(build) {
        build.onBeforeBuild(async () => {
          await $`moon build --target js`;
        });
      }
    }
  ]
});
```

**package.json:**
```json
{
  "files": [
    "dist/",
    "src/**/*.ts",
    "_build/js/debug/build/agent_discovery_core/",
    "README.md",
    "moon.mod.json",
    "agent_discovery_core/"
  ],
  "scripts": {
    "build": "rslib build",
    "test": "moon build --target js && vitest run"
  }
}
```

Trade-offs:
- `_build/` directory included in npm package (currently gitignored, must be generated at publish time)
- Import paths are slightly longer but explicit
- No copy step needed at all

### Option B: Keep copy, use rslib lifecycle hooks

Inline the sync logic into rslib config instead of a separate script file.

```ts
// rslib.config.ts — moonbit plugin
import { execa } from "execa";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function moonbitPlugin() {
  return {
    name: "moonbit",
    setup(build) {
      build.onBeforeBuild(async ({ context }) => {
        // Build MoonBit to JS
        await execa("moon", ["build", "--target", "js"], { cwd: context.rootPath });

        // Sync output to src/moonbit/ — same logic as current script, but inline
        const cwd = context.rootPath;
        const src = join(cwd, "_build", "js", "debug", "build", "agent_discovery_core");
        const dst = join(cwd, "src", "moonbit");
        mkdirSync(dst, { recursive: true });
        for (const f of ["agent_discovery_core.js", "agent_discovery_core.js.map",
                          "agent_discovery_core.d.ts", "moonbit.d.ts"]) {
          copyFileSync(join(src, f), join(dst, f));
        }
      });
    }
  };
}
```

Trade-offs:
- Simpler path migration (imports stay the same)
- Copy logic still exists but embedded in build tool config
- `src/moonbit/` remains gitignored

### Other packages

`agent-finder-cli` and `agent-task-loop` are pure TypeScript CLIs, straightforward tsup → rslib migration:

```ts
// rslib.config.ts
import { defineConfig } from "@rslib/core";

export default defineConfig({
  source: { entry: { cli: "src/cli.ts" } },
  output: { target: "node", format: "esm" },
  tools: {
    rspack: {
      // Keep external deps external (react, ink, etc.)
      externals: ["react", "ink", "citty", "execa", "zod"]
    }
  }
});
```

## Comparison

| Concern | tsup | rslib |
|---------|------|-------|
| Bundle speed | ~30ms | ~20ms (similar, both esbuild-based) |
| DTS generation | Built-in | Built-in via `dts` plugin |
| Lifecycle hooks | Limited (`onSuccess`) | Full plugin API (`onBeforeBuild`, etc.) |
| Format control | ESM-only focus | ESM + CJS + UMD |
| Tree-shaking | Basic | Better (Rspack) |
| MoonBit integration | Manual npm script | Plugin hooks replace script |
| Maturity | Stable (8.x) | 1.0 released, growing |

## Migration Plan

1. Add `rslib` as devDependency to all three packages
2. Create `rslib.config.ts` per package
3. Choose Option A or B for `agent-finder-core` MoonBit bridge
4. Update `package.json` scripts: `tsup` → `rslib build`
5. Verify: `dist/` output identical, `pack --dry-run` shows same files
6. Remove `tsup` devDependency

## Rollback

`rslib.config.ts` can be deleted and `tsup` re-added without structural changes. The MoonBit → JS bridge path (Option A vs B) is a one-line change in the import statement.

## Open Questions

- Option A or B? Option A eliminates the sync script entirely but changes import paths. Option B keeps imports stable.
- Do we need CJS output? Currently ESM-only. Some consumers may want CJS.
- Should `rslib` configuration be shared across packages (workspace config)?
