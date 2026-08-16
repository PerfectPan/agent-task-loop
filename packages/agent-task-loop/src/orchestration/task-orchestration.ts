import {
  createOrchestration,
  type Orchestration,
  type OrchestrationOptions,
  type TemplateSpec,
} from '@rivus/agent-orchestration';

export const CLASSIC_DELIVERY_TEMPLATE: TemplateSpec = {
  id: 'classic-delivery',
  seats: ['impl', 'review'],
  startSeat: 'impl',
  maxTokens: 1,
  mail: [
    { from: 'impl', to: 'review', kind: 'review-request' },
    { from: 'review', to: 'impl', kind: 'review-verdict' },
    { from: 'impl', to: 'review', kind: 'note' },
    { from: 'review', to: 'impl', kind: 'note' },
  ],
};

let shared: Orchestration | undefined;

export function createTaskOrchestration(options: OrchestrationOptions = {}): Orchestration {
  const orchestration = createOrchestration(options);
  orchestration.templates.register(CLASSIC_DELIVERY_TEMPLATE);
  return orchestration;
}

export function getSharedTaskOrchestration(options: OrchestrationOptions = {}): Orchestration {
  if (!shared) {
    shared = createTaskOrchestration(options);
  }
  return shared;
}

export function taskOrchestrationKey(taskId: string): string {
  return `task:${taskId}`;
}
