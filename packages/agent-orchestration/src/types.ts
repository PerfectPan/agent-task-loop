export interface TemplateSpec {
  id: string;
  /** Named seats on this run. The kernel does not interpret the names. */
  seats: string[];
  allow?: {
    /** Seat allowed to spawn after open. Defaults to the first seat. */
    start?: string;
  };
}

export interface SeatBind {
  cmd: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface RunContextInput {
  goal?: string;
  /** Opaque caller reference (e.g. a task id). The kernel does not interpret it. */
  ref?: Record<string, string>;
}

export interface OpenRunInput {
  key: string;
  template: string;
  bind?: Record<string, SeatBind>;
  context?: RunContextInput;
}

export interface FactEntry {
  seat: string;
  text: string;
  at: string;
}

export interface MailEntry {
  from: string;
  to: string;
  body: string;
  at: string;
}

export type SeatStatus = 'idle' | 'running' | 'exited';

export interface SeatState {
  cmd?: string;
  args?: string[];
  status: SeatStatus;
  pid?: number;
}

export interface RunSnapshot {
  key: string;
  template: string;
  seats: Record<string, SeatState>;
  allowed: string;
  occupied: boolean;
  holderPid?: number;
  heartbeatAt?: string;
  context: {
    goal?: string;
    ref?: Record<string, string>;
    facts: FactEntry[];
    mail: MailEntry[];
  };
}

/** Seat-facing view: no env, no host pid details beyond occupancy. */
export interface ObservedRun {
  key: string;
  template: string;
  allowed: string;
  seats: Record<string, { status: SeatStatus }>;
  context: {
    goal?: string;
    ref?: Record<string, string>;
    facts: FactEntry[];
    mail: MailEntry[];
  };
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessRunnerInput {
  cmd: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  onSpawn?: (pid?: number) => void;
}

export type ProcessRunner = (input: ProcessRunnerInput) => Promise<SpawnResult>;
