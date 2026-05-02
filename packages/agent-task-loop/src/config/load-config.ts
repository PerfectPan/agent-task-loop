import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AppConfig } from './schema';
import { appConfigSchema } from './schema';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigFilenames = ['task.config.ts', 'task.config.mts', 'task.config.js', 'task.config.mjs'];

function* walkUpDirectories(start: string): Generator<string> {
  let current = path.resolve(start);
  while (true) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

export function resolveConfigPath(configPath?: string): string {
  if (configPath) {
    const explicitPath = path.resolve(process.cwd(), configPath);
    if (!existsSync(explicitPath)) {
      throw new Error(`Config file not found: ${explicitPath}`);
    }
    return explicitPath;
  }

  const candidates: string[] = [];
  const envConfig = process.env.AGENT_TASK_LOOP_CONFIG;
  if (envConfig) {
    candidates.push(path.resolve(process.cwd(), envConfig));
  }

  for (const directory of walkUpDirectories(process.cwd())) {
    for (const filename of defaultConfigFilenames) {
      candidates.push(path.join(directory, filename));
    }
  }

  for (const filename of defaultConfigFilenames) {
    candidates.push(path.join(packageRoot, filename));
  }

  const resolved = candidates.find(candidate => existsSync(candidate));
  if (!resolved) {
    throw new Error(
      `No task config found. Looked for: ${candidates.join(', ')}. Pass --config or set AGENT_TASK_LOOP_CONFIG.`,
    );
  }

  return resolved;
}

export async function loadConfig(configPath?: string): Promise<AppConfig> {
  const resolvedPath = resolveConfigPath(configPath);
  const mod = await import(pathToFileURL(resolvedPath).href);
  const raw = mod.default ?? mod.config;
  return appConfigSchema.parse(raw);
}
