import type { IntervalHandle, IntervalScheduler } from '../contracts/ports';

export const nodeScheduler: IntervalScheduler = {
  setInterval(fn, ms): IntervalHandle {
    const handle = setInterval(fn, ms);
    handle.unref();
    return handle;
  },
  clearInterval(handle) {
    clearInterval(handle as ReturnType<typeof setInterval>);
  },
};
