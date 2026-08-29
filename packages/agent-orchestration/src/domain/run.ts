import { OrchestrationSeatError } from '../contracts/errors';
import type { OpenRunInput, ObservedRun, RunSnapshot, SeatState, TemplateSpec } from '../contracts/types';

export function occupiedSnapshot(input: {
  key: string;
  template: TemplateSpec;
  bind: OpenRunInput['bind'];
  context: OpenRunInput['context'];
  holderPid: number;
  at: string;
}): RunSnapshot {
  const bind = input.bind ?? {};
  for (const seat of Object.keys(bind)) {
    if (!input.template.seats.includes(seat)) {
      throw new OrchestrationSeatError(input.key, `seat ${seat} is not in template ${input.template.id}`);
    }
  }

  const seats: Record<string, SeatState> = {};
  for (const name of input.template.seats) {
    const bound = bind[name];
    seats[name] = {
      ...(bound?.cmd ? { cmd: bound.cmd } : {}),
      ...(bound?.args ? { args: [...bound.args] } : {}),
      status: 'idle',
    };
  }

  return {
    key: input.key,
    template: input.template.id,
    seats,
    allowed: input.template.allow?.start ?? input.template.seats[0]!,
    occupied: true,
    holderPid: input.holderPid,
    heartbeatAt: input.at,
    context: {
      ...(input.context?.goal ? { goal: input.context.goal } : {}),
      ...(input.context?.ref ? { ref: { ...input.context.ref } } : {}),
      facts: [],
      mail: [],
    },
  };
}

export function releasedSnapshot(snapshot: RunSnapshot, at: string): RunSnapshot {
  return {
    ...snapshot,
    occupied: false,
    holderPid: undefined,
    heartbeatAt: at,
  };
}

export function observeRun(snapshot: RunSnapshot): ObservedRun {
  const seats: ObservedRun['seats'] = {};
  for (const [name, seat] of Object.entries(snapshot.seats)) {
    seats[name] = { status: seat.status };
  }
  return {
    key: snapshot.key,
    template: snapshot.template,
    allowed: snapshot.allowed,
    seats,
    context: {
      ...(snapshot.context.goal ? { goal: snapshot.context.goal } : {}),
      ...(snapshot.context.ref ? { ref: { ...snapshot.context.ref } } : {}),
      facts: [...snapshot.context.facts],
      mail: [...snapshot.context.mail],
    },
  };
}

export function requireSeat(snapshot: RunSnapshot, seat: string): SeatState {
  const state = snapshot.seats[seat];
  if (!state) {
    throw new OrchestrationSeatError(snapshot.key, `unknown seat ${seat}`);
  }
  return state;
}
