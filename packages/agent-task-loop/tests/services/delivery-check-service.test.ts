import { describe, expect, it, vi } from 'vitest';
import { DeliveryCheckService } from '../../src/services/delivery-check-service';

describe('DeliveryCheckService', () => {
  it('treats a clean branch at base ref as non-deliverable', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: 'head-sha\n' })
      .mockResolvedValueOnce({ stdout: 'head-sha\n' });

    const service = new DeliveryCheckService(exec as never);
    const result = await service.check({
      workspacePath: '/tmp/worktree',
      baseRef: 'master',
    });

    expect(result).toEqual({ isDeliverable: false, reason: 'none' });
  });

  it('treats a committed branch ahead of base ref as deliverable', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: 'head-sha\n' })
      .mockResolvedValueOnce({ stdout: 'base-sha\n' });

    const service = new DeliveryCheckService(exec as never);
    const result = await service.check({
      workspacePath: '/tmp/worktree',
      baseRef: 'master',
    });

    expect(result).toEqual({ isDeliverable: true, reason: 'new-commit' });
  });

  it('passes the occupancy cancellation signal to every git probe', async () => {
    const controller = new AbortController();
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: 'head-sha\n' })
      .mockResolvedValueOnce({ stdout: 'head-sha\n' });

    const service = new DeliveryCheckService(exec as never);
    await service.check({
      workspacePath: '/tmp/worktree',
      baseRef: 'master',
      signal: controller.signal,
    });

    for (const call of exec.mock.calls) {
      expect(call[2]).toEqual({ cancelSignal: controller.signal });
    }
  });
});
