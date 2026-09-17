import type { RoomLabAgentId, RoomLabAgentView, RoomLabEventView, RoomLabState } from '../read-model';

export type TurnPhase = 'done' | 'now' | 'queued' | 'held' | 'error';

export interface Turn {
  agent: RoomLabAgentView;
  phase: TurnPhase;
}

export interface Round {
  /** The human message that woke this round. */
  wakeSeq: number;
  turns: Turn[];
  now?: RoomLabAgentView;
  queued: RoomLabAgentView[];
  /** True while at least one member still has to speak. */
  live: boolean;
}

/**
 * The server keeps no "queue"; it wakes members in composition order and
 * runs them one at a time. The round is reconstructed from three facts the
 * read model does carry: the last human message and whom it addressed, who
 * is running, and how far each member has read (seenSeq). A member that has
 * read the waking message has taken its turn; one that has not is still
 * queued. A held draft outranks both, because it is what the member will do
 * next regardless of order.
 */
export function deriveRound(state: Pick<RoomLabState, 'events' | 'agents' | 'activeAgentIds' | 'runningAgentIds'>): Round | undefined {
  const wake = lastHuman(state.events);
  if (!wake) return undefined;
  const byId = new Map(state.agents.map(agent => [agent.id, agent]));
  const addressed = new Set(wake.addressedTo);
  const woken = state.activeAgentIds.filter(id => addressed.size === 0 || addressed.has(id));
  const running = new Set<RoomLabAgentId>(state.runningAgentIds);
  const turns: Turn[] = [];
  for (const id of woken) {
    const agent = byId.get(id);
    if (!agent) continue;
    turns.push({ agent, phase: phaseOf(agent, wake.seq, running.has(id)) });
  }
  const now = turns.find(turn => turn.phase === 'now')?.agent;
  const queued = turns.filter(turn => turn.phase === 'queued').map(turn => turn.agent);
  return {
    wakeSeq: wake.seq,
    turns,
    ...(now ? { now } : {}),
    queued,
    live: now !== undefined || queued.length > 0,
  };
}

function phaseOf(agent: RoomLabAgentView, wakeSeq: number, running: boolean): TurnPhase {
  if (running || agent.status === 'running') return 'now';
  if (agent.status === 'held') return 'held';
  if (agent.seenSeq < wakeSeq) return 'queued';
  if (agent.status === 'error') return 'error';
  return 'done';
}

function lastHuman(events: RoomLabEventView[]): RoomLabEventView | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.kind === 'human' && !event.pending) return event;
  }
  return undefined;
}

/** "轮到 dsh，后面还有 1 位" — the one sentence the header owes the reader. */
export function roundSentence(round: Round | undefined): string | undefined {
  if (!round?.live) return undefined;
  if (round.now) {
    const rest = round.queued.length;
    return rest > 0 ? `轮到 ${round.now.id}，后面还有 ${rest} 位` : `轮到 ${round.now.id}，这是最后一位`;
  }
  const first = round.queued[0];
  return first ? `${first.id} 马上开始` : undefined;
}

/** Whom a message sent right now would wait behind. */
export function behindWhom(round: Round | undefined): RoomLabAgentId | undefined {
  if (!round?.live) return undefined;
  const last = round.queued[round.queued.length - 1] ?? round.now;
  return last?.id;
}
