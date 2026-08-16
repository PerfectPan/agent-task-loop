import type { OrchestrationLogEvent, OrchestrationLogger } from '../contracts/types';

export function logged<T>(
  logger: OrchestrationLogger,
  event: Omit<OrchestrationLogEvent, 'ok'>,
  fn: () => T,
): T {
  try {
    const result = fn();
    logger.log({
      ...event,
      ok: true,
      ...enrichLog(result),
    });
    return result;
  } catch (error) {
    const code = errorCode(error);
    logger.log({
      ...event,
      ok: false,
      ...(code ? { code } : {}),
      ...metricFor(event.cmd, code),
    });
    throw error;
  }
}

function enrichLog(result: unknown): Partial<OrchestrationLogEvent> {
  if (!result || typeof result !== 'object') {
    return {};
  }
  const row = result as {
    term?: unknown;
    lastIndex?: unknown;
    idx?: unknown;
    seat?: unknown;
    code?: unknown;
    metric?: unknown;
  };
  return {
    ...(typeof row.term === 'number' ? { term: row.term } : {}),
    ...(typeof row.lastIndex === 'number'
      ? { idx: row.lastIndex }
      : typeof row.idx === 'number'
        ? { idx: row.idx }
        : {}),
    ...(typeof row.seat === 'string' ? { seat: row.seat } : {}),
    ...(typeof row.code === 'string' ? { code: row.code } : {}),
    ...(typeof row.metric === 'string' ? { metric: row.metric } : {}),
  };
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function metricFor(cmd: string, code: string | undefined): Partial<OrchestrationLogEvent> {
  if (code === 'orchestration-conflict' && cmd === 'open') {
    return { metric: 'orch_open_conflict_total' };
  }
  if (code === 'orchestration-conflict' && (cmd === 'grant' || cmd === 'pass')) {
    return { metric: 'orch_cas_fail_total' };
  }
  if (code === 'orchestration-unauthorized') {
    return { metric: 'orch_spawn_unauthorized_total' };
  }
  return {};
}
