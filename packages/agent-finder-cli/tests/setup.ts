import { afterEach } from 'vitest';
import { cleanup } from 'ink-testing-library';

// Unmount any ink instances left over between tests so timers/effects don't leak.
afterEach(() => {
  cleanup();
});
