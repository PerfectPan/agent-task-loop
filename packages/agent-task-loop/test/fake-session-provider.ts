import { buildPreviewFromTask, type SessionProvider } from '../src/tui/data/session-provider';
import type { SessionPreview } from '../src/tui/types';
import type { TaskRecord } from '../src/types/task';

/**
 * Test double whose {@link SessionProvider.getPreview} returns
 * {@link buildPreviewFromTask}, shallow-merged with any per-taskId override.
 */
export function createFakeSessionProvider(
  overrides: Record<string, Partial<SessionPreview>> = {},
  transcripts: Record<string, string[]> = {},
): SessionProvider {
  return {
    async getPreview(task: TaskRecord, now: number): Promise<SessionPreview> {
      const base = buildPreviewFromTask(task, now);
      // overrides covers only the taskId it was passed.
      const override = overrides[task.taskId] as Partial<SessionPreview> | undefined;
      return override ? { ...base, ...override } : base;
    },
    async getTranscript(sessionId: string): Promise<string[]> {
      return transcripts[sessionId] ?? [];
    },
    async listAvailableSessionIds(): Promise<string[]> {
      return Object.keys(transcripts);
    },
  };
}
