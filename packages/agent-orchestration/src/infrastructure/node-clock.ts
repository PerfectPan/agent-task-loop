import type { Clock } from '../contracts/ports';

export const nodeClock: Clock = {
  now: () => Date.now(),
};
