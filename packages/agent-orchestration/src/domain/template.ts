import { OrchestrationTemplateError } from './errors';

export const DEFAULT_MAX_TOKENS = 1;

export interface MailRoute {
  from: string;
  to: string;
  kind: string;
}

export interface Template {
  id: string;
  startSeat: string | null;
  maxTokens: number;
  seats: string[];
  mail: MailRoute[];
}

export function defineTemplate(input: {
  id: string;
  seats: string[];
  startSeat?: string;
  maxTokens?: number;
  mail?: MailRoute[];
}): Template {
  if (!input.id.trim()) {
    throw new OrchestrationTemplateError('template id is required');
  }
  if (input.seats.length === 0) {
    throw new OrchestrationTemplateError(`template ${input.id} needs at least one seat`);
  }
  const unique = new Set(input.seats);
  if (unique.size !== input.seats.length) {
    throw new OrchestrationTemplateError(`template ${input.id} has duplicate seats`);
  }
  for (const seat of input.seats) {
    if (!seat.trim()) {
      throw new OrchestrationTemplateError(`template ${input.id} has an empty seat name`);
    }
  }
  if (input.startSeat !== undefined && !unique.has(input.startSeat)) {
    throw new OrchestrationTemplateError(
      `template ${input.id} start seat ${input.startSeat} is not in seats`,
    );
  }
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  if (!Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new OrchestrationTemplateError(`template ${input.id} maxTokens must be an integer >= 1`);
  }
  const mail = input.mail ?? [];
  for (const route of mail) {
    if (!route.kind.trim()) {
      throw new OrchestrationTemplateError(`template ${input.id} mail route is missing kind`);
    }
    if (!unique.has(route.from) || !unique.has(route.to)) {
      throw new OrchestrationTemplateError(
        `template ${input.id} mail route ${route.from}->${route.to} is not in seats`,
      );
    }
  }
  return {
    id: input.id,
    startSeat: input.startSeat ?? null,
    maxTokens,
    seats: [...input.seats],
    mail: mail.map(route => ({ from: route.from, to: route.to, kind: route.kind })),
  };
}

export function sameTemplate(left: Template, right: Template): boolean {
  if (left.id !== right.id || left.startSeat !== right.startSeat || left.maxTokens !== right.maxTokens) {
    return false;
  }
  if ([...left.seats].sort().join('\0') !== [...right.seats].sort().join('\0')) {
    return false;
  }
  return mailKey(left) === mailKey(right);
}

function mailKey(spec: Template): string {
  return spec.mail
    .map(route => `${route.from}\0${route.to}\0${route.kind}`)
    .sort()
    .join('\n');
}
