/**
 * The Claude CLI's stream-json events, as both the output formatter and the
 * progress/summary extractors read them.
 */

export interface ClaudeStreamEvent {
  type?: string;
  subtype?: string;
  event?: { type?: string; content_block?: { type?: string; name?: string }; delta?: { type?: string; text?: string } };
  result?: unknown;
  is_error?: boolean;
}

/** The event a stream-json line carries, or undefined for a line that is not one. */
export function claudeStreamEvent(line: string): ClaudeStreamEvent | undefined {
  try {
    const event = JSON.parse(line) as ClaudeStreamEvent;
    if (event.type === undefined) {
      return undefined;
    }
    return event;
  } catch {
    return undefined;
  }
}

/** A stream event's `stream_event` payload, when the event nests one. */
export function claudeInnerEvent(event: ClaudeStreamEvent): ClaudeStreamEvent['event'] | undefined {
  return event.event;
}

/** The result events an output holds, last line first. */
export function claudeResultEvents(output: string): ClaudeStreamEvent[] {
  const events: ClaudeStreamEvent[] = [];
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      events.push(JSON.parse(lines[index]!) as ClaudeStreamEvent);
    } catch {
      continue;
    }
  }
  return events;
}
