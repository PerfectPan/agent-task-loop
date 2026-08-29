import {
  createOrchestration,
  type CreateOrchestrationOptions,
  type Orchestration,
  type TemplateSpec,
} from '@rivus/agent-orchestration';

export const CLASSIC_DELIVERY_TEMPLATE: TemplateSpec = {
  id: 'classic-delivery',
  seats: ['impl', 'review'],
  allow: { start: 'impl' },
};

export function createTaskOrchestration(options: CreateOrchestrationOptions = {}): Orchestration {
  const orchestration = createOrchestration(options);
  orchestration.templates.register(CLASSIC_DELIVERY_TEMPLATE);
  return orchestration;
}

export function taskOrchestrationKey(taskId: string): string {
  return `task:${taskId}`;
}
