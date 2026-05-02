import { execa } from 'execa';

export interface PullRequestSummary {
  number: number;
  url: string;
  description?: string;
}

interface GhPullRequestListItem {
  number: number;
  url: string;
  headRefName?: string;
}

interface GhPullRequestView {
  number: number;
  url: string;
  body?: string;
}

type ExecLike = typeof execa;

function parsePullRequestNumber(url: string): number | undefined {
  const match = url.match(/\/pull\/(\d+)(?:$|[/?#])/);
  if (!match) {
    return undefined;
  }

  const number = Number(match[1]);
  return Number.isFinite(number) ? number : undefined;
}

export class GitHubPullRequestService {
  constructor(private readonly exec: ExecLike = execa) {}

  async findOpenPullRequestByBranch(input: { branch: string }): Promise<PullRequestSummary | undefined> {
    const { stdout } = await this.exec('gh', [
      'pr',
      'list',
      '--head',
      input.branch,
      '--state',
      'open',
      '--json',
      'number,url,headRefName',
      '--limit',
      '20',
    ]);

    const pullRequests = JSON.parse(stdout) as GhPullRequestListItem[];
    const hit = pullRequests.find(item => item.headRefName === input.branch) ?? pullRequests[0];
    if (!hit) {
      return undefined;
    }

    return {
      number: hit.number,
      url: hit.url,
    };
  }

  async getPullRequest(input: { number: number }): Promise<PullRequestSummary> {
    const { stdout } = await this.exec('gh', [
      'pr',
      'view',
      String(input.number),
      '--json',
      'number,url,body',
    ]);

    const pullRequest = JSON.parse(stdout) as GhPullRequestView;
    return {
      number: pullRequest.number,
      url: pullRequest.url,
      description: pullRequest.body ?? '',
    };
  }

  async updatePullRequest(input: {
    number: number;
    description: string;
    title?: string;
  }): Promise<PullRequestSummary> {
    await this.exec('gh', [
      'pr',
      'edit',
      String(input.number),
      ...(typeof input.title === 'string' ? ['--title', input.title] : []),
      '--body',
      input.description,
    ]);

    return this.getPullRequest({ number: input.number });
  }

  async createReadyPullRequest(input: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
  }): Promise<PullRequestSummary> {
    const { stdout } = await this.exec('gh', [
      'pr',
      'create',
      '--head',
      input.sourceBranch,
      '--base',
      input.targetBranch,
      '--title',
      input.title,
      '--body',
      input.description,
    ]);

    const url = stdout.trim();
    const number = parsePullRequestNumber(url);
    if (number) {
      return {
        number,
        url,
        description: input.description,
      };
    }

    const created = await this.findOpenPullRequestByBranch({ branch: input.sourceBranch });
    if (!created) {
      throw new Error(`gh pr create returned no pull request url for ${input.sourceBranch}`);
    }

    return {
      ...created,
      description: input.description,
    };
  }
}
