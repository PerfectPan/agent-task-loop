import type { Store } from './store';

export interface TemplateMailRoute {
  from: string;
  to: string;
  kind: string;
}

export interface TemplateSpec {
  id: string;
  seats: string[];
  startSeat?: string;
  /** Simultaneous Tokens allowed on one Run. Default 1. */
  maxTokens?: number;
  mail?: TemplateMailRoute[];
}

export interface SeatBind {
  cmd: string;
  args?: string[];
}

export type ChannelKind =
  | 'open'
  | 'join'
  | 'leave'
  | 'grant'
  | 'pass'
  | 'mail'
  | 'spawn-authorized'
  | 'release';

export interface ChannelEntry {
  key: string;
  idx: number;
  term: number;
  kind: ChannelKind;
  mailKind: string | null;
  fromSeat: string | null;
  toSeat: string | null;
  body: string;
  createdAt: string;
}

export interface ChannelPage {
  key: string;
  fromIndex: number;
  lastIndex: number;
  term: number;
  maxTokens: number;
  tokens: Array<{ seat: string; partition: string }>;
  entries: ChannelEntry[];
}

export interface RunSnapshot {
  key: string;
  template: string;
  status: 'open' | 'released';
  members: Array<{ seat: string; status: 'joined' | 'left' }>;
  term: number;
  maxTokens: number;
  tokens: Array<{ seat: string; partition: string }>;
  lastIndex: number;
  lastHeartbeatAt: string | null;
}

export interface SpawnPermit {
  key: string;
  seat: string;
  term: number;
  idx: number;
  issuedAt: string;
}

export interface Clock {
  now(): number;
}

export interface ProcessLiveness {
  isAlive(pid: number): boolean;
}

export interface OrchestrationLogEvent {
  cmd: string;
  ok: boolean;
  key?: string;
  seat?: string | null;
  term?: number;
  idx?: number;
  code?: string;
  metric?: string;
}

export interface OrchestrationLogger {
  log(event: OrchestrationLogEvent): void;
}

export interface OrchestrationOptions {
  store?: Store;
  dbPath?: string;
  clock?: Clock;
  liveness?: ProcessLiveness;
  now?: () => number;
  isProcessAlive?: (pid: number) => boolean;
  staleAfterMs?: number;
  supervisorPid?: number;
  logger?: OrchestrationLogger;
}

export interface Orchestration {
  open(input: {
    key: string;
    template: string;
    bind?: Record<string, SeatBind>;
    ref?: Record<string, string>;
    goal?: string;
  }): RunSnapshot;

  join(input: { key: string; seat: string; bind?: SeatBind }): RunSnapshot;
  leave(input: { key: string; seat: string }): RunSnapshot;

  grant(input: {
    key: string;
    seat: string;
    expectedTerm: number;
    partition?: string;
    revokeSeat?: string;
  }): RunSnapshot;
  pass(input: {
    key: string;
    from: string;
    to: string;
    expectedTerm: number;
    partition?: string;
  }): RunSnapshot;
  heartbeat(input: { key: string }): void;

  send(input: {
    key: string;
    from: string;
    to: string | null;
    mailKind: string;
    body: string;
  }): ChannelEntry;

  inbox(input: {
    key: string;
    seat: string;
    markRead?: boolean;
    limit?: number;
  }): ChannelEntry[];

  channel(input: { key: string; fromIndex: number; limit?: number }): ChannelPage;
  snapshot(input: { key: string }): RunSnapshot;

  authorizeSpawn(input: {
    key: string;
    seat: string;
    expectedTerm: number;
  }): SpawnPermit;

  release(input: { key: string }): void;

  templates: {
    register(spec: TemplateSpec): TemplateSpec;
    get(input: { id: string }): TemplateSpec;
    list(): TemplateSpec[];
  };
}
