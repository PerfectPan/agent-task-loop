import { readFileSync } from 'node:fs';

/** This package's version, read from its package.json at run time (source and dist both sit one level down). */
export function getPackageVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return manifest.version;
}
