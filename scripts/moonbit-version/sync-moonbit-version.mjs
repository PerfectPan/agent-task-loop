import { readFile, writeFile } from 'node:fs/promises';

export async function syncMoonBitVersion(input) {
  const packageJson = await readJson(input.packageJsonPath);
  const moonModJson = await readJson(input.moonModJsonPath);
  const packageVersion = packageJson.version;
  const moonBitVersion = moonModJson.version;

  if (!packageVersion) {
    throw new Error(`${input.packageJsonPath} is missing version`);
  }

  if (!moonBitVersion) {
    throw new Error(`${input.moonModJsonPath} is missing version`);
  }

  if (packageVersion === moonBitVersion) {
    return { changed: false, version: packageVersion };
  }

  if (input.check) {
    throw new Error(
      `MoonBit version ${moonBitVersion} does not match ${packageJson.name} version ${packageVersion}`,
    );
  }

  await writeFile(input.moonModJsonPath, JSON.stringify({ ...moonModJson, version: packageVersion }, null, 2) + '\n');
  return { changed: true, version: packageVersion };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
