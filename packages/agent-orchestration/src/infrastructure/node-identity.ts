import type { ProcessIdentity } from '../contracts/ports';

export function nodeIdentity(): ProcessIdentity {
  return { pid: process.pid };
}
