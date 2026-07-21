import { createConfiguredDesktopServices } from '@rivus/agent-task-loop/task-manager';
import { createLocalServer, type LocalServer } from './create-server.js';

/**
 * Create a fully configured local server with real shared dependencies.
 * Used by the Electron main process and the headless CLI.
 */
export async function createConfiguredLocalServer(): Promise<LocalServer> {
  const { application, backgroundStart } = await createConfiguredDesktopServices();
  return createLocalServer({ application, backgroundStart });
}
