import type { ProcessLiveness } from '../contracts/ports';

export const nodeLiveness: ProcessLiveness = {
  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
};
