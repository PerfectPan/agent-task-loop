import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const repoRoot = new URL('../..', import.meta.url).pathname;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function workspaceManifests() {
  const listed = JSON.parse(
    execFileSync('pnpm', ['ls', '--recursive', '--depth', '-1', '--json'], { cwd: repoRoot, encoding: 'utf8' }),
  );
  return listed.map((entry) => ({
    path: relative(repoRoot, join(entry.path, 'package.json')),
    manifest: JSON.parse(readFileSync(join(entry.path, 'package.json'), 'utf8')),
  }));
}

// `"alias": "workspace:@scope/pkg@*"` depends on @scope/pkg; any other entry names the package itself.
function dependencyTarget(name, spec) {
  const alias = /^workspace:(@?[^@]+)@/.exec(spec);
  return alias ? alias[1] : name;
}

// Licenses come from package.json, so the rule follows the metadata: an MIT package must not
// depend on a GPL-3.0-only workspace package, because building or bundling it would ship GPL
// code under an MIT label.
function findLicenseViolations(workspace) {
  const licenseOf = new Map(workspace.map(({ manifest }) => [manifest.name, manifest.license]));
  const missing = workspace
    .filter(({ manifest }) => typeof manifest.license !== 'string' || manifest.license === '')
    .map(({ path }) => `${path} has no license field`);
  const gplDependencies = workspace
    .filter(({ manifest }) => manifest.license === 'MIT')
    .flatMap(({ path, manifest }) =>
      DEPENDENCY_FIELDS.flatMap((field) =>
        Object.entries(manifest[field] ?? {})
          .map(([name, spec]) => dependencyTarget(name, spec))
          .filter((target) => licenseOf.get(target) === 'GPL-3.0-only')
          .map((target) => `${manifest.name} (MIT) lists GPL-3.0-only ${target} in ${path} ${field}`),
      ),
    );
  return [...missing, ...gplDependencies];
}

test('every workspace package declares a license and MIT packages depend on no GPL-3.0-only workspace package', () => {
  const workspace = workspaceManifests();
  assert.ok(
    workspace.some(({ manifest }) => manifest.license === 'MIT'),
    'expected at least one MIT workspace package',
  );
  assert.deepEqual(findLicenseViolations(workspace), []);
});

test('the license check reports missing licenses and GPL dependencies of MIT packages', () => {
  const workspace = [
    { path: 'packages/gpl/package.json', manifest: { name: '@x/gpl', license: 'GPL-3.0-only' } },
    {
      path: 'packages/mit/package.json',
      manifest: {
        name: '@x/mit',
        license: 'MIT',
        dependencies: { '@x/gpl': 'workspace:*' },
        devDependencies: { 'gpl-alias': 'workspace:@x/gpl@*', '@x/other-mit': 'workspace:*' },
      },
    },
    { path: 'packages/other-mit/package.json', manifest: { name: '@x/other-mit', license: 'MIT' } },
    {
      path: 'apps/app/package.json',
      manifest: { name: '@x/app', license: 'GPL-3.0-only', dependencies: { '@x/mit': 'workspace:*' } },
    },
    { path: 'apps/unlicensed/package.json', manifest: { name: '@x/unlicensed' } },
  ];

  assert.deepEqual(findLicenseViolations(workspace), [
    'apps/unlicensed/package.json has no license field',
    '@x/mit (MIT) lists GPL-3.0-only @x/gpl in packages/mit/package.json dependencies',
    '@x/mit (MIT) lists GPL-3.0-only @x/gpl in packages/mit/package.json devDependencies',
  ]);
});
