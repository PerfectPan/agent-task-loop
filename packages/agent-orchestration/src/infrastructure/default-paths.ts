import os from 'node:os';
import path from 'node:path';

export function defaultDbPath(): string {
  return path.join(os.homedir(), '.agent-orchestration', 'orchestration.db');
}
