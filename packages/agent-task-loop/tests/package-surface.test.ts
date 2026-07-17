import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(new URL('..', import.meta.url).pathname);

describe('published package surface', () => {
  it('publishes the CLI and Rivus Plugin as separate entrypoints', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      bin: Record<string, string>;
      exports: Record<string, { types: string; import: string }>;
      files: string[];
      peerDependenciesMeta: Record<string, { optional: boolean }>;
      scripts: Record<string, string>;
    };

    expect(packageJson.bin['agent-task-loop']).toBe('./bin/agent-task-loop.mjs');
    expect(packageJson.exports['./rivus-plugin']).toEqual({
      types: './dist/rivus-plugin.d.ts',
      import: './dist/rivus-plugin.js',
    });
    expect(packageJson.files).toContain('docs/rivus-plugin.md');
    expect(packageJson.peerDependenciesMeta['@rivus/agent']).toEqual({ optional: true });
    expect(packageJson.scripts['package:check']).toBe('node scripts/check-package.mjs');
    expect(packageJson.scripts.prepack).toBe('rslib build');
  });

  it('builds a dedicated Rivus Plugin entry', async () => {
    const config = await readFile(path.join(packageRoot, 'rslib.config.ts'), 'utf8');

    expect(config).toContain('"rivus-plugin": "src/rivus-plugin.ts"');
  });
});
