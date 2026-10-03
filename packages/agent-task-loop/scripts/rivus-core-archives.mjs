import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const corePackageNames = ['@rivus/platform', '@rivus/runtime', '@rivus/gateway', '@rivus/agent'];

export function assertSupportedRivusCoreVersion(version) {
  if (typeof version !== 'string' || !/^0\.17\.(?:0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Unsupported Rivus Core version ${version}; expected >=0.17.0 <0.18.0`);
  }
}

export function readRivusCoreArchives(input, directory = process.cwd()) {
  let archivePaths;
  try {
    archivePaths = JSON.parse(input);
  } catch {
    throw new Error('RIVUS_CORE_ARCHIVES_JSON must be a JSON array of four archive paths');
  }
  if (
    !Array.isArray(archivePaths) ||
    archivePaths.length !== corePackageNames.length ||
    archivePaths.some((archivePath) => typeof archivePath !== 'string' || !archivePath.trim())
  ) {
    throw new Error('RIVUS_CORE_ARCHIVES_JSON must contain exactly four nonempty archive paths');
  }

  const archives = new Map();
  for (const archivePath of archivePaths) {
    const resolvedPath = realpathSync(path.resolve(directory, archivePath));
    if (!statSync(resolvedPath).isFile() || !resolvedPath.endsWith('.tgz')) {
      throw new Error('Every Rivus Core archive must be a .tgz file');
    }
    const manifest = JSON.parse(
      execFileSync('tar', ['-xOf', resolvedPath, 'package/package.json'], { encoding: 'utf8' }),
    );
    if (!corePackageNames.includes(manifest.name)) {
      throw new Error(`Unexpected Rivus Core archive package ${manifest.name}`);
    }
    if (archives.has(manifest.name)) {
      throw new Error(`Duplicate Rivus Core archive for ${manifest.name}`);
    }
    assertSupportedRivusCoreVersion(manifest.version);
    const contents = readFileSync(resolvedPath);
    archives.set(manifest.name, {
      name: manifest.name,
      version: manifest.version,
      path: resolvedPath,
      manifest,
      sha256: createHash('sha256').update(contents).digest('hex'),
      integrity: `sha512-${createHash('sha512').update(contents).digest('base64')}`,
    });
  }

  const orderedArchives = corePackageNames.map((name) => archives.get(name));
  if (orderedArchives.some((archive) => !archive)) {
    throw new Error('Rivus Core archives must include platform, runtime, gateway, and agent');
  }
  if (new Set(orderedArchives.map((archive) => archive.version)).size !== 1) {
    throw new Error('Rivus Core archives must have the same version');
  }
  return orderedArchives;
}

export function verifyRivusCoreArchives(consumerDirectory, archives) {
  const consumerManifestPath = path.join(consumerDirectory, 'package.json');
  const consumerManifest = JSON.parse(readFileSync(consumerManifestPath, 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(consumerDirectory, 'package-lock.json'), 'utf8'));
  if (!lock.packages) {
    throw new Error('Expected an npm package lock with package provenance');
  }
  const expectedArchives = new Map(archives.map((archive) => [archive.name, archive]));
  const manifestPaths = [consumerManifestPath];

  for (const archive of archives) {
    if (createHash('sha256').update(readFileSync(archive.path)).digest('hex') !== archive.sha256) {
      throw new Error(`Rivus Core archive changed during installation: ${archive.name}`);
    }
    assertArchiveSource(consumerManifest.dependencies?.[archive.name], archive, consumerDirectory);
    assertArchiveSource(lock.packages['']?.dependencies?.[archive.name], archive, consumerDirectory);
    if (!lock.packages[`node_modules/${archive.name}`]) {
      throw new Error(`Rivus Core lock entry is missing: ${archive.name}`);
    }
    const manifestPath = path.join(consumerDirectory, 'node_modules', archive.name, 'package.json');
    const installedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!isDeepStrictEqual(installedManifest, archive.manifest)) {
      throw new Error(`Installed Rivus Core manifest does not match archive: ${archive.name}`);
    }
    manifestPaths.push(manifestPath);
  }

  for (const [location, entry] of Object.entries(lock.packages)) {
    const name = location.match(/(?:^|\/)node_modules\/(@rivus\/(?:platform|runtime|gateway|agent))$/)?.[1];
    const archive = expectedArchives.get(name ?? entry.name);
    if (!archive) {
      continue;
    }
    if (entry.version !== archive.version || entry.integrity !== archive.integrity) {
      throw new Error(`Rivus Core lock version or integrity does not match archive: ${archive.name}`);
    }
    assertArchiveSource(entry.resolved, archive, consumerDirectory);
  }

  for (const manifestPath of manifestPaths) {
    const resolve = createRequire(manifestPath).resolve;
    for (const archive of archives) {
      const installedPath = path.join(consumerDirectory, 'node_modules', archive.name, 'package.json');
      if (realpathSync(resolve(`${archive.name}/package.json`)) !== realpathSync(installedPath)) {
        throw new Error(`Rivus Core resolves to an unexpected installation: ${archive.name}`);
      }
    }
  }

  return archives.map(({ name, version, sha256 }) => ({ name, version, sha256 }));
}

function assertArchiveSource(source, archive, consumerDirectory) {
  if (typeof source !== 'string' || !source.startsWith('file:')) {
    throw new Error(`Rivus Core source is not the supplied archive: ${archive.name}`);
  }
  const sourcePath = source.startsWith('file://')
    ? fileURLToPath(source)
    : path.resolve(consumerDirectory, source.slice('file:'.length));
  if (realpathSync(sourcePath) !== archive.path) {
    throw new Error(`Rivus Core source is not the supplied archive: ${archive.name}`);
  }
}
