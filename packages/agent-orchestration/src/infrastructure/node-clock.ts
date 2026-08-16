import type { Clock } from '../contracts/types';

export const nodeClock: Clock = {
  now: () => Date.now(),
};
