import { loadConfig } from '../config/load-config';
import { assertRuntimeConfig } from '../config/runtime-guard';
import { TaskService } from '../services/task-service';

/**
 * What every task command parses and resolves before its service: the shared
 * `--config` and `--json` argument fragments, and the config the `--config`
 * override names.
 */
export const taskCommandArgs = {
  config: {
    type: 'string' as const,
  },
  json: {
    type: 'boolean' as const,
    default: false,
  },
};

export async function loadCommandConfig(args: { config?: unknown }): Promise<Awaited<ReturnType<typeof loadConfig>>> {
  return loadConfig(typeof args.config === 'string' ? args.config : undefined);
}

/** The runtime-checked config and its task service every task command starts with. */
export async function taskServiceFrom(args: { config?: unknown }): Promise<TaskService> {
  const config = await loadCommandConfig(args);
  assertRuntimeConfig(config);
  return new TaskService(config);
}
