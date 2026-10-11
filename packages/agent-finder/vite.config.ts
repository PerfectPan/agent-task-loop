import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite-plus';

/**
 * MoonBit 产物同步，等价于原 rslib 的 moonbit-plugin
 * （@rivus/rslib-config 的 sync-moonbit.ts，随该包一起被删除）：
 * 构建前运行 `moon build --target js`，把生成的 JS 与声明从 `_build`
 * 拷到 `src/moonbit/`。该目录被 .gitignore 忽略，`src/infrastructure/moonbit-api.ts`
 * 直接 import 其中的 `agent_discovery_core.js`，所以不跑这步打包就会解析失败。
 */
function syncMoonBitOutput(): void {
  execSync('moon build --target js', { cwd: import.meta.dirname, stdio: 'inherit' });

  const src = join(import.meta.dirname, '_build', 'js', 'debug', 'build', 'agent_discovery_core');
  const dst = join(import.meta.dirname, 'src', 'moonbit');
  mkdirSync(dst, { recursive: true });

  for (const file of [
    'agent_discovery_core.js',
    'agent_discovery_core.js.map',
    'agent_discovery_core.d.ts',
    'moonbit.d.ts',
  ]) {
    copyFileSync(join(src, file), join(dst, file));
  }
}

// Equivalent of the former rslib setup (`libConfig` from @rivus/rslib-config plus
// the moonbit plugin): one ESM entry bundled into `dist/index.js`, with
// declarations bundled into a single `dist/index.d.ts` so the `types` path in
// package.json resolves. `vp pack` (tsdown) defaults to unambiguous `.mjs`/
// `.d.mts` names on the node platform, so pin `fixedExtension: false` to keep
// the package.json paths.
export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'node',
    dts: true,
    fixedExtension: false,
    hooks: {
      'build:prepare': syncMoonBitOutput,
    },
  },
});
