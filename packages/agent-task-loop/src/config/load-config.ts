import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig } from './schema';
import { appConfigSchema } from './schema';

/** The single global config location: `~/.agent-task-loop/config.json`. */
export function globalConfigPath(): string {
  return path.join(os.homedir(), '.agent-task-loop', 'config.json');
}

/**
 * Resolves the config file from exactly three places, in order:
 *   1. `--config <path>` (explicit; must exist)
 *   2. `AGENT_TASK_LOOP_CONFIG` env var
 *   3. `~/.agent-task-loop/config.json` (global)
 * No cwd walk-up, no package-example fallback. Config is JSON only.
 */
export function resolveConfigPath(configPath?: string): string {
  if (configPath) {
    const explicit = path.resolve(process.cwd(), configPath);
    if (!existsSync(explicit)) {
      throw new Error(`Config file not found: ${explicit}`);
    }
    return explicit;
  }

  const envConfig = process.env.AGENT_TASK_LOOP_CONFIG;
  if (envConfig) {
    return path.resolve(process.cwd(), envConfig);
  }

  const global = globalConfigPath();
  if (existsSync(global)) {
    return global;
  }

  throw new Error(
    'No config found. Run `agent-task-loop init`, or pass --config / set AGENT_TASK_LOOP_CONFIG.',
  );
}

export async function loadConfig(configPath?: string): Promise<AppConfig> {
  const resolved = resolveConfigPath(configPath);
  const raw = JSON.parse(readFileSync(resolved, 'utf8'));
  return appConfigSchema.parse(raw);
}
