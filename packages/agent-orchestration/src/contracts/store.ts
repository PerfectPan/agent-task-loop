import type { ChannelEntry, TemplateMailRoute } from './types';

export interface RunRow {
  key: string;
  templateId: string;
  term: number;
  maxTokens: number;
  status: 'open' | 'released';
  supervisorPid: number | null;
  lastHeartbeatAt: string | null;
  lastIndex: number;
  goal: string | null;
  refJson: string | null;
  createdAt: string;
  updatedAt: string;
}

/** casRun 允许的补丁。禁止含 lastIndex。 */
export interface RunPatch {
  term?: number;
  status?: 'open' | 'released';
  supervisorPid?: number | null;
  lastHeartbeatAt?: string | null;
  goal?: string | null;
  refJson?: string | null;
  updatedAt: string;
}

export interface MemberRow {
  seat: string;
  status: 'joined' | 'left';
  cmd: string | null;
  argsJson: string | null;
  joinedAt: string;
  leftAt: string | null;
}

export interface TokenRow {
  seat: string;
  partition: string;
}

export interface StoredTemplate {
  id: string;
  startSeat: string | null;
  maxTokens: number;
  seats: string[];
  mail: TemplateMailRoute[];
}

export interface Store {
  migrate(): void;
  close(): void;
  withTransaction<T>(fn: (tx: Store) => T): T;
  upsertTemplate(spec: StoredTemplate, now: string): void;
  getTemplate(id: string): StoredTemplate | undefined;
  listTemplates(): StoredTemplate[];
  getRun(key: string): RunRow | undefined;
  insertRun(row: RunRow): boolean;
  upsertRun(row: RunRow): void;
  casRun(key: string, expectedTerm: number, patch: RunPatch): boolean;
  touchHeartbeat(key: string, at: string): boolean;
  listMembers(key: string): MemberRow[];
  getMember(key: string, seat: string): MemberRow | undefined;
  upsertMember(key: string, member: MemberRow): void;
  listTokens(key: string): TokenRow[];
  insertToken(key: string, seat: string, partition: string): void;
  deleteToken(key: string, seat: string): void;
  clearTokens(key: string): void;
  appendChannel(entry: Omit<ChannelEntry, 'idx'>): ChannelEntry;
  listChannel(key: string, fromIndex: number, limit: number): ChannelEntry[];
  listInbox(key: string, seat: string, afterIdx: number, limit: number): ChannelEntry[];
  getCursor(key: string, seat: string): number;
  setCursor(key: string, seat: string, idx: number): void;
}
