import type { SessionHistoryEntry } from '../types';

/** SessionHistoryEntry fields that hold optional string values. */
type OptionalStringField = 'sessionName' | 'sessionId' | 'workspacePath' | 'runId';

/** Maps a `key=value` segment key to its SessionHistoryEntry field. */
const OPTIONAL_KEYS: Record<string, OptionalStringField> = {
  name: 'sessionName',
  id: 'sessionId',
  workspace: 'workspacePath',
  run: 'runId',
};

/** Pull `[value]` out of the first segment, returning the timestamp if present. */
function parseTimestamp(segment: string): string | undefined {
  const match = /^\[(.*)\]$/.exec(segment);
  return match ? match[1] : undefined;
}

/** Split a `key=value` segment into its parts (value may itself contain `=`). */
function parseKeyValue(segment: string): { key: string; value: string } | null {
  const index = segment.indexOf('=');
  if (index <= 0) {
    return null;
  }
  return { key: segment.slice(0, index).trim(), value: segment.slice(index + 1).trim() };
}

/** Parse one trimmed, non-empty line into an entry, or null when malformed. */
function parseLine(line: string): SessionHistoryEntry | null {
  const segments = line.split('|').map(part => part.trim()).filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  let timestamp: string | undefined;
  const fields: Record<string, string> = {};

  for (const segment of segments) {
    const ts = parseTimestamp(segment);
    if (ts !== undefined) {
      timestamp = ts;
      continue;
    }
    const kv = parseKeyValue(segment);
    if (kv) {
      fields[kv.key] = kv.value;
    }
  }

  const { round, kind, agent } = fields;
  if (round === undefined || kind === undefined || agent === undefined) {
    return null;
  }
  const roundNumber = Number(round);
  if (!Number.isFinite(roundNumber)) {
    return null;
  }

  const entry: SessionHistoryEntry = {
    round: roundNumber,
    kind,
    agent,
    raw: line,
  };
  if (timestamp !== undefined) {
    entry.timestamp = timestamp;
  }
  for (const [key, target] of Object.entries(OPTIONAL_KEYS)) {
    const value = fields[key];
    if (value !== undefined && value !== '') {
      entry[target] = value;
    }
  }

  return entry;
}

/**
 * Inverse of {@link formatSessionHistoryEntry}: parse a multi-line
 * `TaskRecord.sessionHistory` string into structured entries.
 *
 * Tolerates blank/whitespace/undefined input ([]), missing optional segments,
 * and skips lines lacking the required round+kind+agent fields. Input order is
 * preserved.
 */
export function parseSessionHistory(text: string | undefined): SessionHistoryEntry[] {
  if (!text || !text.trim()) {
    return [];
  }

  const entries: SessionHistoryEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const entry = parseLine(line);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}
