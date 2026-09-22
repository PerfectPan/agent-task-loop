import type { RoomLabAgentStatus } from '../read-model';
import { copy } from '../copy';

/**
 * Status → the word the person scans. Read-model words never reach the
 * screen; the words live in copy.ts so every surface that shows a member's
 * state shows the same one, and copy.test.ts keeps them noun phrases.
 */
export const agentStatusLabels: Record<RoomLabAgentStatus, string> = {
  idle: copy.status.idle,
  running: copy.status.running,
  completed: copy.status.completed,
  posted: copy.status.posted,
  held: copy.status.held,
  silent: copy.status.silent,
  error: copy.status.error,
};

export type StatusTone = 'quiet' | 'run' | 'held' | 'err';

export const agentStatusTone: Record<RoomLabAgentStatus, StatusTone> = {
  idle: 'quiet',
  running: 'run',
  completed: 'quiet',
  posted: 'quiet',
  held: 'held',
  silent: 'quiet',
  error: 'err',
};

export const toneDot: Record<StatusTone, string> = {
  quiet: 'bg-success-foreground',
  run: 'bg-info-foreground',
  held: 'bg-warning-foreground',
  err: 'bg-destructive',
};

export const toneText: Record<StatusTone, string> = {
  quiet: 'text-muted-foreground',
  run: 'text-info-foreground',
  held: 'text-warning-foreground',
  err: 'text-destructive',
};

/** A member's CLI as a Badge variant. */
export const availabilityVariant = {
  runnable: 'info',
  missing: 'muted',
} as const;
