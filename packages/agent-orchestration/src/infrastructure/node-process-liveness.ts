import type { ProcessLiveness } from '../contracts/types';

export const nodeProcessLiveness: ProcessLiveness = {
  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
};
