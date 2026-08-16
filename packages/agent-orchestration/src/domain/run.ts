import {
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationSeatError,
  OrchestrationTemplateError,
  OrchestrationUnauthorizedError,
  OrchestrationValidationError,
} from './errors';
import type { MailRoute, Template } from './template';

export const MAX_BODY_LENGTH = 65_536;
export const DEFAULT_PAGE_LIMIT = 200;

export type ChannelKind =
  | 'open'
  | 'join'
  | 'leave'
  | 'grant'
  | 'pass'
  | 'mail'
  | 'spawn-authorized'
  | 'release';

export interface DomainEvent {
  kind: ChannelKind;
  term: number;
  mailKind: string | null;
  fromSeat: string | null;
  toSeat: string | null;
  body: string;
}

export interface Token {
  seat: string;
  partition: string;
}

export interface Member {
  seat: string;
  status: 'joined' | 'left';
  cmd: string | null;
  argsJson: string | null;
  joinedAt: string;
  leftAt: string | null;
}

export interface SeatBind {
  cmd: string;
  args?: string[];
}

export interface RunSnapshot {
  key: string;
  template: string;
  status: 'open' | 'released';
  members: Array<{ seat: string; status: 'joined' | 'left' }>;
  term: number;
  maxTokens: number;
  tokens: Token[];
  lastIndex: number;
  lastHeartbeatAt: string | null;
}

export interface SpawnPermit {
  key: string;
  seat: string;
  term: number;
  issuedAt: string;
}

export interface Occupancy {
  nowMs: number;
  staleAfterMs: number;
  isAlive(pid: number): boolean;
}

export type OpenOutcome = 'created' | 'stale-takeover' | 'reopen';

/** Aggregate: one Run. Invariants for occupy, tokens, members, and mail live here. */
export class Run {
  private constructor(
    private props: {
      key: string;
      templateId: string;
      seats: string[];
      mail: MailRoute[];
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
      members: Member[];
      tokens: Token[];
    },
  ) {}

  static createFirst(input: {
    key: string;
    template: Template;
    bind?: Record<string, SeatBind>;
    goal?: string;
    refJson?: string | null;
    supervisorPid: number | null;
    now: string;
  }): { run: Run; events: DomainEvent[] } {
    if (!input.key.trim()) {
      throw new OrchestrationValidationError('run key is required');
    }
    assertBind(input.key, input.template, input.bind);
    const members = input.template.seats.map(seat => memberFromBind(seat, input.bind?.[seat], input.now));
    const run = new Run({
      key: input.key,
      templateId: input.template.id,
      seats: [...input.template.seats],
      mail: [...input.template.mail],
      term: 0,
      maxTokens: input.template.maxTokens,
      status: 'open',
      supervisorPid: input.supervisorPid,
      lastHeartbeatAt: input.now,
      lastIndex: 0,
      goal: input.goal ?? null,
      refJson: input.refJson ?? null,
      createdAt: input.now,
      updatedAt: input.now,
      members,
      tokens: [],
    });
    const events: DomainEvent[] = [systemEvent('open', 0)];
    for (const seat of input.template.seats) {
      events.push(systemEvent('join', 0, { toSeat: seat }));
    }
    return { run, events };
  }

  static rehydrate(input: {
    key: string;
    template: Template;
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
    members: Member[];
    tokens: Token[];
  }): Run {
    return new Run({
      key: input.key,
      templateId: input.template.id,
      seats: [...input.template.seats],
      mail: [...input.template.mail],
      term: input.term,
      maxTokens: input.maxTokens,
      status: input.status,
      supervisorPid: input.supervisorPid,
      lastHeartbeatAt: input.lastHeartbeatAt,
      lastIndex: input.lastIndex,
      goal: input.goal,
      refJson: input.refJson,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      members: input.members.map(member => ({ ...member })),
      tokens: input.tokens.map(token => ({ ...token })),
    });
  }

  get key(): string {
    return this.props.key;
  }

  get term(): number {
    return this.props.term;
  }

  get status(): 'open' | 'released' {
    return this.props.status;
  }

  get supervisorPid(): number | null {
    return this.props.supervisorPid;
  }

  isFresh(occupancy: Occupancy): boolean {
    const { status, supervisorPid, lastHeartbeatAt } = this.props;
    if (status !== 'open' || supervisorPid === null || !lastHeartbeatAt) {
      return false;
    }
    const at = Date.parse(lastHeartbeatAt);
    if (Number.isNaN(at)) {
      return false;
    }
    if (occupancy.nowMs - at > occupancy.staleAfterMs) {
      return false;
    }
    return occupancy.isAlive(supervisorPid);
  }

  openAgain(input: {
    template: Template;
    bind?: Record<string, SeatBind>;
    goal?: string;
    refJson?: string | null;
    supervisorPid: number | null;
    now: string;
    occupancy: Occupancy;
  }): { events: DomainEvent[]; outcome: OpenOutcome } {
    if (this.props.templateId !== input.template.id) {
      throw new OrchestrationTemplateError(
        `run ${this.props.key} already uses template ${this.props.templateId}`,
      );
    }
    assertBind(this.props.key, input.template, input.bind);
    if (this.props.status === 'open' && this.isFresh(input.occupancy)) {
      throw new OrchestrationConflictError(this.props.key, this.props.supervisorPid ?? undefined);
    }
    if (this.props.status === 'open') {
      this.takeOverStale(input);
      return { events: [], outcome: 'stale-takeover' };
    }
    return { events: this.reopenReleased(input), outcome: 'reopen' };
  }

  join(seat: string, bind: SeatBind | undefined, now: string): DomainEvent {
    this.requireOpen();
    if (!this.props.seats.includes(seat)) {
      throw new OrchestrationSeatError(
        this.props.key,
        `seat ${seat} is not in template ${this.props.templateId}`,
      );
    }
    const previous = this.member(seat);
    this.upsertMember({
      seat,
      status: 'joined',
      cmd: bind?.cmd ?? previous?.cmd ?? null,
      argsJson: bind?.args ? JSON.stringify(bind.args) : previous?.argsJson ?? null,
      joinedAt: previous?.joinedAt ?? now,
      leftAt: null,
    });
    this.touch(now);
    return systemEvent('join', this.props.term, { toSeat: seat });
  }

  leave(seat: string, now: string): DomainEvent {
    this.requireOpen();
    this.requireJoined(seat);
    const member = this.member(seat)!;
    this.upsertMember({ ...member, status: 'left', leftAt: now });
    this.props.tokens = this.props.tokens.filter(token => token.seat !== seat);
    this.touch(now);
    return systemEvent('leave', this.props.term, { fromSeat: seat });
  }

  grant(input: {
    seat: string;
    expectedTerm: number;
    partition?: string;
    revokeSeat?: string;
    now: string;
  }): DomainEvent {
    this.requireOpen();
    this.requireJoined(input.seat);
    this.requireTerm(input.expectedTerm);
    this.applyGrant(input.seat, input.partition ?? '', input.revokeSeat);
    this.props.term = input.expectedTerm + 1;
    this.touch(input.now);
    return systemEvent('grant', this.props.term, { toSeat: input.seat });
  }

  pass(input: { from: string; to: string; expectedTerm: number; partition?: string; now: string }): DomainEvent {
    this.requireOpen();
    this.requireJoined(input.to);
    this.requireTerm(input.expectedTerm);
    const held = this.props.tokens.find(token => token.seat === input.from);
    if (!held) {
      throw new OrchestrationSeatError(this.props.key, `seat ${input.from} does not hold a token`);
    }
    if (this.props.tokens.some(token => token.seat === input.to)) {
      throw new OrchestrationSeatError(this.props.key, `seat ${input.to} already holds a token`);
    }
    const partition = input.partition ?? held.partition;
    this.assertPartitionFree(
      this.props.tokens.filter(token => token.seat !== input.from),
      partition,
    );
    this.props.tokens = [
      ...this.props.tokens.filter(token => token.seat !== input.from),
      { seat: input.to, partition },
    ];
    this.props.term = input.expectedTerm + 1;
    this.touch(input.now);
    return systemEvent('pass', this.props.term, { fromSeat: input.from, toSeat: input.to });
  }

  send(input: { from: string; to: string | null; mailKind: string; body: string }): DomainEvent {
    this.requireOpen();
    assertMailKind(input.mailKind);
    assertSendBody(input.body);
    this.requireJoined(input.from);
    if (input.to !== null) {
      this.requireJoined(input.to);
    }
    this.assertMailRoute(input.from, input.to, input.mailKind);
    return {
      kind: 'mail',
      term: this.props.term,
      mailKind: input.mailKind,
      fromSeat: input.from,
      toSeat: input.to,
      body: input.body,
    };
  }

  authorizeSpawn(seat: string, expectedTerm: number, now: string): { event: DomainEvent; permit: SpawnPermit } {
    this.requireOpen();
    this.requireJoined(seat);
    this.requireTerm(expectedTerm);
    if (!this.props.tokens.some(token => token.seat === seat)) {
      throw new OrchestrationUnauthorizedError(this.props.key, seat);
    }
    return {
      event: systemEvent('spawn-authorized', this.props.term, { toSeat: seat }),
      permit: { key: this.props.key, seat, term: this.props.term, issuedAt: now },
    };
  }

  release(now: string): DomainEvent | undefined {
    if (this.props.status === 'released') {
      return undefined;
    }
    this.props.status = 'released';
    this.props.supervisorPid = null;
    this.props.tokens = [];
    this.touch(now);
    return systemEvent('release', this.props.term);
  }

  heartbeat(now: string): void {
    if (this.props.status !== 'open') {
      return;
    }
    this.props.lastHeartbeatAt = now;
    this.props.updatedAt = now;
  }

  snapshot(): RunSnapshot {
    return {
      key: this.props.key,
      template: this.props.templateId,
      status: this.props.status,
      members: this.props.members.map(member => ({ seat: member.seat, status: member.status })),
      term: this.props.term,
      maxTokens: this.props.maxTokens,
      tokens: this.props.tokens.map(token => ({ ...token })),
      lastIndex: this.props.lastIndex,
      lastHeartbeatAt: this.props.lastHeartbeatAt,
    };
  }

  inspectMembers(): Array<{ seat: string; status: 'joined' | 'left'; cmd?: string; args?: string[] }> {
    return this.props.members.map(member => ({
      seat: member.seat,
      status: member.status,
      ...(member.cmd ? { cmd: member.cmd } : {}),
      ...(member.argsJson ? { args: parseArgs(member.argsJson) } : {}),
    }));
  }

  persistence(): {
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
    members: Member[];
    tokens: Token[];
  } {
    return {
      key: this.props.key,
      templateId: this.props.templateId,
      term: this.props.term,
      maxTokens: this.props.maxTokens,
      status: this.props.status,
      supervisorPid: this.props.supervisorPid,
      lastHeartbeatAt: this.props.lastHeartbeatAt,
      lastIndex: this.props.lastIndex,
      goal: this.props.goal,
      refJson: this.props.refJson,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
      members: this.props.members.map(member => ({ ...member })),
      tokens: this.props.tokens.map(token => ({ ...token })),
    };
  }

  hasMember(seat: string): boolean {
    return this.member(seat) !== undefined;
  }

  private takeOverStale(input: {
    bind?: Record<string, SeatBind>;
    goal?: string;
    refJson?: string | null;
    supervisorPid: number | null;
    now: string;
  }): void {
    this.props.supervisorPid = input.supervisorPid;
    this.props.lastHeartbeatAt = input.now;
    this.props.goal = input.goal ?? this.props.goal;
    this.props.refJson = input.refJson ?? this.props.refJson;
    this.props.tokens = [];
    this.applyBind(input.bind);
    this.touch(input.now);
  }

  private reopenReleased(input: {
    template: Template;
    bind?: Record<string, SeatBind>;
    goal?: string;
    refJson?: string | null;
    supervisorPid: number | null;
    now: string;
  }): DomainEvent[] {
    this.props.term += 1;
    this.props.status = 'open';
    this.props.supervisorPid = input.supervisorPid;
    this.props.lastHeartbeatAt = input.now;
    this.props.goal = input.goal ?? this.props.goal;
    this.props.refJson = input.refJson ?? this.props.refJson;
    this.props.tokens = [];
    for (const seat of input.template.seats) {
      const previous = this.member(seat);
      const bind = input.bind?.[seat];
      this.upsertMember({
        seat,
        status: 'joined',
        cmd: bind?.cmd ?? previous?.cmd ?? null,
        argsJson: bind?.args ? JSON.stringify(bind.args) : previous?.argsJson ?? null,
        joinedAt: previous?.joinedAt ?? input.now,
        leftAt: null,
      });
    }
    this.touch(input.now);
    const events: DomainEvent[] = [systemEvent('open', this.props.term)];
    for (const member of this.props.members) {
      if (member.status === 'joined') {
        events.push(systemEvent('join', this.props.term, { toSeat: member.seat }));
      }
    }
    return events;
  }

  private applyGrant(seat: string, partition: string, revokeSeat?: string): void {
    const tokens = this.props.tokens;
    const held = tokens.find(token => token.seat === seat);
    if (held) {
      this.assertPartitionFree(
        tokens.filter(token => token.seat !== seat),
        partition,
      );
      this.props.tokens = [...tokens.filter(token => token.seat !== seat), { seat, partition }];
      return;
    }
    this.assertPartitionFree(tokens, partition);
    if (tokens.length < this.props.maxTokens) {
      this.props.tokens = [...tokens, { seat, partition }];
      return;
    }
    if (revokeSeat) {
      if (!tokens.some(token => token.seat === revokeSeat)) {
        throw new OrchestrationSeatError(this.props.key, `seat ${revokeSeat} does not hold a token`);
      }
      this.props.tokens = [...tokens.filter(token => token.seat !== revokeSeat), { seat, partition }];
      return;
    }
    if (this.props.maxTokens === 1 && tokens.length === 1) {
      this.props.tokens = [{ seat, partition }];
      return;
    }
    throw new OrchestrationConflictError(this.props.key);
  }

  private applyBind(bind: Record<string, SeatBind> | undefined): void {
    if (!bind) {
      return;
    }
    for (const [seat, value] of Object.entries(bind)) {
      const member = this.member(seat);
      if (!member) {
        continue;
      }
      this.upsertMember({
        ...member,
        cmd: value.cmd,
        argsJson: value.args ? JSON.stringify(value.args) : member.argsJson,
      });
    }
  }

  private assertMailRoute(from: string, to: string | null, mailKind: string): void {
    if (this.props.mail.length === 0) {
      return;
    }
    if (to === null) {
      throw new OrchestrationValidationError('broadcast send is not allowed when mail routes are registered');
    }
    const allowed = this.props.mail.some(
      route => route.from === from && route.to === to && route.kind === mailKind,
    );
    if (!allowed) {
      throw new OrchestrationValidationError(
        `mail ${from}->${to} kind ${mailKind} is not allowed by template ${this.props.templateId}`,
      );
    }
  }

  private assertPartitionFree(tokens: Token[], partition: string): void {
    if (!partition) {
      return;
    }
    if (tokens.some(token => token.partition === partition)) {
      throw new OrchestrationConflictError(this.props.key);
    }
  }

  private requireTerm(expectedTerm: number): void {
    if (!Number.isInteger(expectedTerm) || expectedTerm < 0) {
      throw new OrchestrationValidationError('expectedTerm must be an integer >= 0');
    }
    if (this.props.term !== expectedTerm) {
      throw new OrchestrationConflictError(this.props.key, this.props.supervisorPid ?? undefined);
    }
  }

  private requireOpen(): void {
    if (this.props.status !== 'open') {
      throw new OrchestrationNotFoundError(this.props.key);
    }
  }

  private requireJoined(seat: string): Member {
    const member = this.member(seat);
    if (!member) {
      throw new OrchestrationSeatError(this.props.key, `unknown seat ${seat}`);
    }
    if (member.status !== 'joined') {
      throw new OrchestrationSeatError(this.props.key, `seat ${seat} is not joined`);
    }
    return member;
  }

  private member(seat: string): Member | undefined {
    return this.props.members.find(item => item.seat === seat);
  }

  private upsertMember(member: Member): void {
    this.props.members = [...this.props.members.filter(item => item.seat !== member.seat), member];
  }

  private touch(now: string): void {
    this.props.updatedAt = now;
  }
}

function memberFromBind(seat: string, bind: SeatBind | undefined, now: string): Member {
  return {
    seat,
    status: 'joined',
    cmd: bind?.cmd ?? null,
    argsJson: bind?.args ? JSON.stringify(bind.args) : null,
    joinedAt: now,
    leftAt: null,
  };
}

function assertBind(key: string, template: Template, bind: Record<string, SeatBind> | undefined): void {
  if (!bind) {
    return;
  }
  for (const seat of Object.keys(bind)) {
    if (!template.seats.includes(seat)) {
      throw new OrchestrationSeatError(key, `seat ${seat} is not in template ${template.id}`);
    }
  }
}

export function assertSendBody(body: string): void {
  if (typeof body !== 'string') {
    throw new OrchestrationValidationError('send body is required');
  }
  if (body.length > MAX_BODY_LENGTH) {
    throw new OrchestrationValidationError(`send body exceeds ${MAX_BODY_LENGTH} bytes`);
  }
}

export function assertMailKind(mailKind: string): void {
  if (!mailKind || !mailKind.trim()) {
    throw new OrchestrationValidationError('mailKind is required');
  }
}

function systemEvent(
  kind: Exclude<ChannelKind, 'mail'>,
  term: number,
  seats: { fromSeat?: string | null; toSeat?: string | null } = {},
): DomainEvent {
  return {
    kind,
    term,
    mailKind: null,
    fromSeat: seats.fromSeat ?? null,
    toSeat: seats.toSeat ?? null,
    body: '{}',
  };
}

function parseArgs(argsJson: string): string[] | undefined {
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    return Array.isArray(parsed) ? parsed.map(value => String(value)) : undefined;
  } catch {
    return undefined;
  }
}
