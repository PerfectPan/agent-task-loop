import { describe, expect, it, vi } from 'vitest';
import { PublishContextService } from '../../src/services/publish-context-service';

describe('PublishContextService', () => {
  it('loads branch head and dirty state from workspace', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'task/task-301-claude\n' })
      .mockResolvedValueOnce({ stdout: 'abc123\n' })
      .mockResolvedValueOnce({ stdout: ' M setup.sh\n' })
      .mockResolvedValueOnce({ stdout: ' setup.sh | 12 +++++++++---\n' })
      .mockResolvedValueOnce({ stdout: 'diff --git a/setup.sh b/setup.sh\n' });

    const service = new PublishContextService(exec as never);
    const context = await service.load('/tmp/worktree');

    expect(context.branch).toBe('task/task-301-claude');
    expect(context.headCommit).toBe('abc123');
    expect(context.isDirty).toBe(true);
    expect(context.diffStat).toContain('setup.sh');
    expect(context.diff).toContain('diff --git');
  });
});
