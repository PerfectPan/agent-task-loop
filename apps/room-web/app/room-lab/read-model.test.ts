import { describe, expect, it } from 'vitest';
import {
  RoomLabStateSelector,
  takeNewestRoomState,
  type RoomLabState,
} from './read-model';

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

  it('rejects a different epoch until a loader confirms it', () => {
    const current = stateAt(8, false, 'epoch-a');
    const restarted = stateAt(1, false, 'epoch-b');

    expect(takeNewestRoomState(current, restarted)).toBe(current);
  });
});

describe('RoomLabStateSelector', () => {
  it('adopts a loader-confirmed epoch and rejects the retired epoch if it arrives late', () => {
    const selector = new RoomLabStateSelector();
    const oldState = stateAt(8, false, 'epoch-a');
    const restarted = stateAt(1, false, 'epoch-b');

    expect(selector.takeLoader(oldState, restarted)).toBe(restarted);
    expect(selector.takeLoader(restarted, oldState)).toBe(restarted);
    expect(selector.takeAction(restarted, oldState)).toBe(restarted);
  });
});

function stateAt(revision: number, busy: boolean, epoch = 'epoch-a'): RoomLabState {
  return {
    roomId: 'local/web-room',
    epoch,
    head: revision,
    revision,
    busy,
    events: [],
    agents: [],
  };
}
