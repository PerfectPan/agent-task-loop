import { describe, expect, it, vi } from 'vitest';
import { GitHubPullRequestService } from '../../src/services/github-pull-request-service';

describe('GitHubPullRequestService', () => {
  it('reuses an existing open pull request for the same source branch', async () => {
    const exec = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([
        {
          number: 12,
          url: 'https://github.com/acme/demo/pull/12',
          headRefName: 'task/demo-12',
        },
      ]),
    });

    const service = new GitHubPullRequestService(exec as never);
    await expect(service.findOpenPullRequestByBranch({ branch: 'task/demo-12' })).resolves.toEqual({
      number: 12,
      url: 'https://github.com/acme/demo/pull/12',
    });

    expect(exec).toHaveBeenCalledWith('gh', [
      'pr',
      'list',
      '--head',
      'task/demo-12',
      '--state',
      'open',
      '--json',
      'number,url,headRefName',
      '--limit',
      '20',
    ]);
  });

  it('creates a pull request and parses the returned GitHub URL', async () => {
    const exec = vi.fn().mockResolvedValue({
      stdout: 'https://github.com/acme/demo/pull/21\n',
    });

    const service = new GitHubPullRequestService(exec as never);
    await expect(
      service.createReadyPullRequest({
        sourceBranch: 'task/demo-21',
        targetBranch: 'main',
        title: 'fix: demo',
        description: 'body',
      }),
    ).resolves.toEqual({
      number: 21,
      url: 'https://github.com/acme/demo/pull/21',
      description: 'body',
    });
  });

  it('updates a pull request body and returns the persisted body', async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 22,
          url: 'https://github.com/acme/demo/pull/22',
          body: 'next body',
        }),
      });

    const service = new GitHubPullRequestService(exec as never);
    await expect(service.updatePullRequest({ number: 22, description: 'next body' })).resolves.toEqual({
      number: 22,
      url: 'https://github.com/acme/demo/pull/22',
      description: 'next body',
    });

    expect(exec).toHaveBeenNthCalledWith(1, 'gh', ['pr', 'edit', '22', '--body', 'next body']);
  });
});
