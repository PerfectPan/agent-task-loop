import {
  ROOM_AGENT_ROSTER,
  type RoomLabAgentId,
} from './agent-roster';
import { RoomComposition } from './room-composition';

export type CountOffStatus = 'running' | 'completed' | 'failed';

export interface CountOffReport {
  agentId: RoomLabAgentId;
  number: number;
  seq: number;
}

export interface CountOffSnapshot {
  runId: string;
  status: CountOffStatus;
  nextNumber: number;
  total: number;
  agentIds: RoomLabAgentId[];
  reports: CountOffReport[];
  failedAgentId?: RoomLabAgentId;
  error?: string;
}

export class CountOffRun {
  private readonly agentIds: RoomLabAgentId[];
  private readonly reports: CountOffReport[] = [];
  private status: CountOffStatus = 'running';
  private error?: string;
  private failedAgentId?: RoomLabAgentId;

  constructor(
    readonly runId: string,
    agentIds: readonly RoomLabAgentId[] = ROOM_AGENT_ROSTER.map(agent => agent.id),
  ) {
    this.agentIds = new RoomComposition(agentIds).snapshot();
  }

  next(): { agentId: RoomLabAgentId; number: number } | undefined {
    if (this.status !== 'running') return undefined;
    const agentId = this.agentIds[this.reports.length];
    return agentId ? { agentId, number: this.reports.length + 1 } : undefined;
  }

  accept(input: { agentId: RoomLabAgentId; reply: string; seq: number }): CountOffReport {
    const expected = this.validateReply(input);
    this.validateSequence(input.seq);
    const report = { agentId: input.agentId, number: expected.number, seq: input.seq };
    this.reports.push(report);
    if (this.reports.length === this.agentIds.length) this.status = 'completed';
    return report;
  }

  validateReply(input: { agentId: RoomLabAgentId; reply: string }): {
    agentId: RoomLabAgentId;
    number: number;
  } {
    const expected = this.next();
    if (!expected) throw new CountOffInvariantError('The count-off run is not accepting reports');
    if (input.agentId !== expected.agentId) {
      throw new CountOffInvariantError(
        `Expected ${expected.agentId} to report ${expected.number}, received ${input.agentId}`,
      );
    }
    if (input.reply.trim() !== String(expected.number)) {
      throw new CountOffInvariantError(
        `${input.agentId} must reply exactly ${expected.number}`,
      );
    }
    return expected;
  }

  fail(error: string): void {
    if (this.status !== 'running') return;
    this.failedAgentId = this.next()?.agentId;
    this.status = 'failed';
    this.error = error;
  }

  private validateSequence(seq: number): void {
    const previousSeq = this.reports.at(-1)?.seq ?? 0;
    if (!Number.isSafeInteger(seq) || seq <= previousSeq) {
      throw new CountOffInvariantError(
        `Count-off sequence must be a safe integer greater than ${previousSeq}`,
      );
    }
  }

  snapshot(): CountOffSnapshot {
    return {
      runId: this.runId,
      status: this.status,
      nextNumber: Math.min(this.reports.length + 1, this.agentIds.length),
      total: this.agentIds.length,
      agentIds: [...this.agentIds],
      reports: this.reports.map(report => ({ ...report })),
      ...(this.failedAgentId ? { failedAgentId: this.failedAgentId } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }
}

export class CountOffInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CountOffInvariantError';
  }
}
