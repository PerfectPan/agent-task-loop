import type { Store } from '../contracts/store';
import type { ChannelEntry, ChannelPage, RunSnapshot, TemplateSpec } from '../contracts/types';
import { OrchestrationNotFoundError, OrchestrationSeatError, OrchestrationTemplateError } from '../domain/errors';
import { DEFAULT_PAGE_LIMIT, Run } from '../domain/run';
import type { Template } from '../domain/template';

export class QueryHandler {
  constructor(private readonly store: Store) {}

  snapshot(input: { key: string }): RunSnapshot {
    return this.store.withTransaction(tx => this.load(tx, input.key).snapshot());
  }

  channel(input: { key: string; fromIndex: number; limit?: number }): ChannelPage {
    return this.store.withTransaction(tx => {
      const run = this.load(tx, input.key);
      const snapshot = run.snapshot();
      return {
        key: input.key,
        fromIndex: input.fromIndex,
        lastIndex: snapshot.lastIndex,
        term: snapshot.term,
        maxTokens: snapshot.maxTokens,
        tokens: snapshot.tokens,
        entries: tx.listChannel(input.key, input.fromIndex, input.limit ?? DEFAULT_PAGE_LIMIT),
      };
    });
  }

  inbox(input: { key: string; seat: string; limit?: number }): ChannelEntry[] {
    return this.store.withTransaction(tx => {
      const run = this.load(tx, input.key);
      if (!run.hasMember(input.seat)) {
        throw new OrchestrationSeatError(input.key, `unknown seat ${input.seat}`);
      }
      const cursor = tx.getCursor(input.key, input.seat);
      return tx.listInbox(input.key, input.seat, cursor, input.limit ?? DEFAULT_PAGE_LIMIT);
    });
  }

  inspect(key: string): {
    snapshot: RunSnapshot;
    supervisorPid: number | null;
    members: Array<{ seat: string; status: 'joined' | 'left'; cmd?: string; args?: string[] }>;
  } {
    return this.store.withTransaction(tx => {
      const run = this.load(tx, key);
      return {
        snapshot: run.snapshot(),
        supervisorPid: run.supervisorPid,
        members: run.inspectMembers(),
      };
    });
  }

  getTemplate(id: string): TemplateSpec {
    const template = this.store.getTemplate(id);
    if (!template) {
      throw new OrchestrationTemplateError(`unknown template ${id}`);
    }
    return toSpec(template);
  }

  listTemplates(): TemplateSpec[] {
    return this.store.listTemplates().map(toSpec);
  }

  private load(tx: Store, key: string): Run {
    const row = tx.getRun(key);
    if (!row) {
      throw new OrchestrationNotFoundError(key);
    }
    const template = tx.getTemplate(row.templateId);
    if (!template) {
      throw new OrchestrationTemplateError(`unknown template ${row.templateId}`);
    }
    return Run.rehydrate({
      key: row.key,
      template,
      term: row.term,
      maxTokens: row.maxTokens,
      status: row.status,
      supervisorPid: row.supervisorPid,
      lastHeartbeatAt: row.lastHeartbeatAt,
      lastIndex: row.lastIndex,
      goal: row.goal,
      refJson: row.refJson,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      members: tx.listMembers(key),
      tokens: tx.listTokens(key),
    });
  }
}

function toSpec(template: Template): TemplateSpec {
  return {
    id: template.id,
    seats: [...template.seats],
    ...(template.startSeat ? { startSeat: template.startSeat } : {}),
    maxTokens: template.maxTokens,
    ...(template.mail.length > 0 ? { mail: template.mail.map(route => ({ ...route })) } : {}),
  };
}
