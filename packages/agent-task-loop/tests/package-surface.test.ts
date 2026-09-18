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
    expect(packageJson.exports['./task-delivery']).toEqual({
      types: './dist/task-delivery.d.ts',
      import: './dist/task-delivery.js',
    });
    expect(packageJson.files).toContain('docs/rivus-plugin.md');
    expect(packageJson.peerDependenciesMeta['@rivus/agent']).toEqual({ optional: true });
    expect(packageJson.scripts['package:check']).toBe('node scripts/check-package.mjs');
    expect(packageJson.scripts.prepack).toBe('rslib build');
  });

  it('builds a dedicated Rivus Plugin entry', async () => {
    const config = await readFile(path.join(packageRoot, 'rslib.config.ts'), 'utf8');

    expect(config).toContain('"rivus-plugin": "src/rivus-plugin.ts"');
    expect(config).toContain('"task-delivery": "src/task-delivery.ts"');
  });

  it('keeps the Task Delivery domain and application free of infrastructure imports', async () => {
    const domainFiles = [
      'src/task-delivery/domain/errors.ts',
      'src/task-delivery/domain/model.ts',
      'src/task-delivery/domain/review-verdict.ts',
      'src/task-delivery/domain/task-delivery.ts',
    ];
    for (const file of domainFiles) {
      const source = await readFile(path.join(packageRoot, file), 'utf8');
      expect(source, file).not.toContain('node:');
      expect(source, file).not.toMatch(/from ['"].*application/);
      expect(source, file).not.toMatch(/from ['"].*infrastructure/);
      expect(source, file).not.toContain('@rivus/agent-room');
    }
    const application = await readFile(
      path.join(packageRoot, 'src/task-delivery/application/task-delivery-application.ts'),
      'utf8',
    );
    expect(application).not.toContain('node:');
    expect(application).not.toContain('@rivus/agent-room');
  });
});
