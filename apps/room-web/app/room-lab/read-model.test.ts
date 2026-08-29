import { describe, expect, it } from 'vitest';
import { takeNewestRoomState, type RoomLabState } from './read-model';

describe('takeNewestRoomState', () => {
  it('rejects a late polling response with an older revision', () => {
    const current = stateAt(8, false);
    const stalePoll = stateAt(7, true);

    expect(takeNewestRoomState(current, stalePoll)).toBe(current);
  });

  it('rejects a different snapshot carrying the same revision', () => {
    const current = stateAt(8, false);
    const ambiguousPoll = { ...stateAt(8, true), head: 7 };

    expect(takeNewestRoomState(current, ambiguousPoll)).toBe(current);
  });
});

function stateAt(revision: number, busy: boolean): RoomLabState {
  return {
    roomId: 'local/web-room',
    head: revision,
    revision,
    busy,
    events: [],
    agents: [],
  };
}
