import type { OrchestrationLogEvent, OrchestrationLogger } from '../contracts/types';

export const silentLogger: OrchestrationLogger = {
  log() {},
};

export function createStderrLogger(): OrchestrationLogger {
  return {
    log(event: OrchestrationLogEvent) {
      process.stderr.write(`[orch] ${JSON.stringify(event)}\n`);
    },
  };
}

export function defaultLogger(): OrchestrationLogger {
  return process.env.ORCH_LOG === '0' ? silentLogger : createStderrLogger();
}

export class RecordingLogger implements OrchestrationLogger {
  readonly events: OrchestrationLogEvent[] = [];
  readonly counts = new Map<string, number>();

  log(event: OrchestrationLogEvent): void {
    this.events.push(event);
    if (event.metric) {
      this.counts.set(event.metric, (this.counts.get(event.metric) ?? 0) + 1);
    }
  }
}
