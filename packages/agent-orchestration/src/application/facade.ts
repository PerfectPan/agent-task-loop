import type { Store } from '../contracts/store';
import type {
  ChannelEntry,
  ChannelPage,
  Clock,
  Orchestration,
  OrchestrationLogger,
  ProcessLiveness,
  RunSnapshot,
  SeatBind,
  SpawnPermit,
  TemplateSpec,
} from '../contracts/types';
import { CommandHandler } from './commands';
import { logged } from './logging';
import { QueryHandler } from './queries';

export interface FacadeDeps {
  store: Store;
  clock: Clock;
  liveness: ProcessLiveness;
  supervisorPid: number | null;
  staleAfterMs: number;
  logger: OrchestrationLogger;
}

export interface InspectedRun {
  snapshot: RunSnapshot;
  supervisorPid: number | null;
  members: Array<{ seat: string; status: 'joined' | 'left'; cmd?: string; args?: string[] }>;
}

/** Public application facade. Commands write; queries only read. */
export class OrchestrationFacade implements Orchestration {
  readonly templates: Orchestration['templates'];
  private readonly commands: CommandHandler;
  private readonly queries: QueryHandler;
  private readonly store: Store;
  private readonly logger: OrchestrationLogger;

  constructor(deps: FacadeDeps) {
    this.store = deps.store;
    this.logger = deps.logger;
    this.commands = new CommandHandler(deps);
    this.queries = new QueryHandler(deps.store);
    this.templates = {
      register: spec => this.commands.registerTemplate(spec),
      get: input => this.queries.getTemplate(input.id),
      list: () => this.queries.listTemplates(),
    };
  }

  close(): void {
    this.store.close();
  }

  open(input: {
    key: string;
    template: string;
    bind?: Record<string, SeatBind>;
    ref?: Record<string, string>;
    goal?: string;
  }): RunSnapshot {
    return logged(this.logger, { cmd: 'open', key: input.key }, () => {
      const result = this.commands.open(input);
      if (result.code || result.metric) {
        return Object.assign(result.snapshot, {
          ...(result.code ? { code: result.code } : {}),
          ...(result.metric ? { metric: result.metric } : {}),
        });
      }
      return result.snapshot;
    });
  }

  join(input: { key: string; seat: string; bind?: SeatBind }): RunSnapshot {
    return logged(this.logger, { cmd: 'join', key: input.key, seat: input.seat }, () => this.commands.join(input));
  }

  leave(input: { key: string; seat: string }): RunSnapshot {
    return logged(this.logger, { cmd: 'leave', key: input.key, seat: input.seat }, () => this.commands.leave(input));
  }

  grant(input: {
    key: string;
    seat: string;
    expectedTerm: number;
    partition?: string;
    revokeSeat?: string;
  }): RunSnapshot {
    return logged(this.logger, { cmd: 'grant', key: input.key, seat: input.seat }, () => this.commands.grant(input));
  }

  pass(input: {
    key: string;
    from: string;
    to: string;
    expectedTerm: number;
    partition?: string;
  }): RunSnapshot {
    return logged(this.logger, { cmd: 'pass', key: input.key, seat: input.to }, () => this.commands.pass(input));
  }

  heartbeat(input: { key: string }): void {
    logged(this.logger, { cmd: 'heartbeat', key: input.key }, () => this.commands.heartbeat(input));
  }

  send(input: {
    key: string;
    from: string;
    to: string | null;
    mailKind: string;
    body: string;
  }): ChannelEntry {
    return logged(this.logger, { cmd: 'send', key: input.key, seat: input.from }, () => this.commands.send(input));
  }

  inbox(input: {
    key: string;
    seat: string;
    markRead?: boolean;
    limit?: number;
  }): ChannelEntry[] {
    return logged(this.logger, { cmd: 'inbox', key: input.key, seat: input.seat }, () => {
      const entries = this.queries.inbox(input);
      if (input.markRead && entries.length > 0) {
        this.commands.markInboxRead({ key: input.key, seat: input.seat, idx: entries[entries.length - 1]!.idx });
      }
      return entries;
    });
  }

  channel(input: { key: string; fromIndex: number; limit?: number }): ChannelPage {
    return logged(this.logger, { cmd: 'channel', key: input.key }, () => this.queries.channel(input));
  }

  snapshot(input: { key: string }): RunSnapshot {
    return logged(this.logger, { cmd: 'snapshot', key: input.key }, () => this.queries.snapshot(input));
  }

  authorizeSpawn(input: { key: string; seat: string; expectedTerm: number }): SpawnPermit {
    return logged(this.logger, { cmd: 'authorizeSpawn', key: input.key, seat: input.seat }, () =>
      this.commands.authorizeSpawn(input),
    );
  }

  release(input: { key: string }): void {
    logged(this.logger, { cmd: 'release', key: input.key }, () => this.commands.release(input));
  }

  inspect(key: string): InspectedRun {
    return this.queries.inspect(key);
  }
}
