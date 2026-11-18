/**
 * The Claude CLI's stream-json events, as both the output formatter and the
 * progress/summary extractors read them.
 */

import { jsonLinesLastFirst } from '../utils/json-lines';

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
  // A bare `null` (or any non-object) is valid JSON but not an event; the
  // result consumers read `.type` on every element, so it must not enter.
  return jsonLinesLastFirst(output).filter(
    (value): value is ClaudeStreamEvent => value !== null && typeof value === 'object',
  );
}
