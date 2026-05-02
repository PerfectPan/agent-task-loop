import { setTimeout as delay } from 'node:timers/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execa } from 'execa';
import { runLarkCli } from '../../src/services/lark-cli';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('node:timers/promises', () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

describe('runLarkCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries transient lark-cli network failures', async () => {
    vi.mocked(execa)
      .mockRejectedValueOnce(new Error('net/http: TLS handshake timeout'))
      .mockResolvedValueOnce({ stdout: '{"ok":true}' } as never);

    await expect(runLarkCli(['base', '+record-upsert'])).resolves.toBe('{"ok":true}');
    expect(execa).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(1000);
  });

  it('does not retry non-transient lark-cli failures', async () => {
    vi.mocked(execa).mockRejectedValueOnce(new Error('Permission denied'));

    await expect(runLarkCli(['base', '+record-upsert'])).rejects.toThrow('Permission denied');
    expect(execa).toHaveBeenCalledTimes(1);
  });
});
