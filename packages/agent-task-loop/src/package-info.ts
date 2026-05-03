import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    version: string;
  };

  return packageJson.version;
}
