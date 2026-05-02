interface SessionHistoryEntryInput {
  kind: 'execute' | 'review' | 'publish-commit' | 'publish-pr';
  round: number;
  agent: string;
  sessionName?: string;
  sessionId?: string;
  workspacePath?: string;
  runId?: string;
  timestamp?: string;
}

function compactValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function formatSessionHistoryEntry(input: SessionHistoryEntryInput): string {
  const parts = [
    `[${input.timestamp ?? new Date().toISOString()}]`,
    `round=${input.round}`,
    `kind=${input.kind}`,
    `agent=${input.agent}`,
  ];

  if (input.sessionName) {
    parts.push(`name=${compactValue(input.sessionName)}`);
  }
  if (input.sessionId) {
    parts.push(`id=${compactValue(input.sessionId)}`);
  }
  if (input.workspacePath) {
    parts.push(`workspace=${compactValue(input.workspacePath)}`);
  }
  if (input.runId) {
    parts.push(`run=${compactValue(input.runId)}`);
  }

  return parts.join(' | ');
}

export function appendSessionHistory(existing: string | undefined, entry: string): string {
  const normalizedEntry = compactValue(entry);
  if (!normalizedEntry) {
    return existing ?? '';
  }

  if (!existing || !existing.trim()) {
    return normalizedEntry;
  }

  const lines = existing
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.includes(normalizedEntry)) {
    return existing;
  }

  return `${existing}\n${normalizedEntry}`;
}
