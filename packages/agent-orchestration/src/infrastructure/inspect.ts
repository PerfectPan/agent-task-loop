import type { InspectedRun, OrchestrationFacade } from '../application/facade';
import type { Orchestration } from '../contracts/types';

export function inspect(orch: Orchestration, key: string): InspectedRun {
  if (!hasInspect(orch)) {
    throw new Error('inspect requires the node kernel');
  }
  return orch.inspect(key);
}

function hasInspect(orch: Orchestration): orch is OrchestrationFacade {
  return typeof (orch as OrchestrationFacade).inspect === 'function';
}
