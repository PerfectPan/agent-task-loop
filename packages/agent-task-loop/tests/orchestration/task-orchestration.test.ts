import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OrchestrationConflictError } from '@rivus/agent-orchestration';
import {
  CLASSIC_DELIVERY_TEMPLATE,
  createTaskOrchestration,
  taskOrchestrationKey,
} from '../../src/orchestration/task-orchestration';

describe('createTaskOrchestration', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('registers classic-delivery and conflicts on a second open of the same task key', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'atl-orch-'));
    dirs.push(dir);
    const a = createTaskOrchestration({ baseDir: dir });
    const b = createTaskOrchestration({ baseDir: dir });
    const key = taskOrchestrationKey('T-1');

    expect(a.templates.get(CLASSIC_DELIVERY_TEMPLATE.id).seats).toEqual(['impl', 'review']);
    await a.open({ key, template: CLASSIC_DELIVERY_TEMPLATE.id });
    await expect(b.open({ key, template: CLASSIC_DELIVERY_TEMPLATE.id })).rejects.toBeInstanceOf(
      OrchestrationConflictError,
    );
  });
});
