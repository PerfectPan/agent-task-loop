import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

describe('published package surface', () => {
  it('ships the files every export points at', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, { types: string; import: string }>;
    };

    for (const [entry, target] of Object.entries(packageJson.exports)) {
      expect(existsSync(join(packageRoot, target.types)), `${entry} types: ${target.types}`).toBe(true);
      expect(existsSync(join(packageRoot, target.import)), `${entry} import: ${target.import}`).toBe(true);
    }
  });

  it('ships only the bundled CLI and its declarations from dist', () => {
    const [pack] = JSON.parse(
      execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: packageRoot, encoding: 'utf8' }),
    ) as [{ files: { path: string }[] }];
    const distFiles = pack.files
      .map((file) => file.path)
      .filter((path) => path.startsWith('dist/'))
      .sort();

    expect(distFiles).toEqual(['dist/cli.d.ts', 'dist/cli.js']);
  });
});
