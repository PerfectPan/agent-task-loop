import { OrchestrationFacade } from '../application/facade';
import type { Orchestration, OrchestrationOptions } from '../contracts/types';
import { defaultDbPath } from './default-paths';
import { defaultLogger } from './logger';
import { nodeClock } from './node-clock';
import { nodeProcessLiveness } from './node-process-liveness';
import { SqliteStore } from './sqlite-store';

export function createOrchestration(options: OrchestrationOptions = {}): Orchestration {
  const store = options.store ?? new SqliteStore(options.dbPath ?? defaultDbPath());
  store.migrate();
  return new OrchestrationFacade({
    store,
    clock: options.clock ?? { now: options.now ?? nodeClock.now },
    liveness: options.liveness ?? { isAlive: options.isProcessAlive ?? nodeProcessLiveness.isAlive },
    supervisorPid: options.supervisorPid ?? process.pid,
    staleAfterMs: options.staleAfterMs ?? 120_000,
    logger: options.logger ?? defaultLogger(),
  });
}

export function closeOrchestration(orch: Orchestration): void {
  if ('close' in orch && typeof orch.close === 'function') {
    orch.close();
  }
}
