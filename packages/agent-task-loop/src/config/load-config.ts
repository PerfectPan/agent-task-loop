import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AppConfig } from './schema';
import { appConfigSchema } from './schema';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigFilenames = [
  'task.config.ts',
  'task.config.mts',
  'task.config.js',
  'task.config.mjs',
  'task.config.json',
];

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

  const envConfig = process.env.AGENT_TASK_LOOP_CONFIG;
  if (envConfig) {
    const envPath = path.resolve(process.cwd(), envConfig);
    return envPath;
  }

  for (const directory of walkUpDirectories(process.cwd())) {
    for (const filename of defaultConfigFilenames) {
      const candidate = path.join(directory, filename);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  for (const filename of defaultConfigFilenames) {
    const candidate = path.join(packageRoot, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const globalConfigPath = path.join(os.homedir(), '.agent-task-loop', 'config.json');
  if (existsSync(globalConfigPath)) {
    return globalConfigPath;
  }

  throw new Error(
    `No task config found. Run \`agent-task-loop init\` to create a global config, or pass --config / set AGENT_TASK_LOOP_CONFIG.`,
  );
}

function loadConfigFromPath(resolvedPath: string): Promise<AppConfig> | AppConfig {
  if (resolvedPath.endsWith('.json')) {
    const raw = JSON.parse(readFileSync(resolvedPath, 'utf8'));
    return appConfigSchema.parse(raw);
  }
  return import(pathToFileURL(resolvedPath).href).then(mod => {
    const raw = mod.default ?? mod.config;
    return appConfigSchema.parse(raw);
  });
}

export async function loadConfig(configPath?: string): Promise<AppConfig> {
  const resolvedPath = resolveConfigPath(configPath);
  return loadConfigFromPath(resolvedPath);
}
