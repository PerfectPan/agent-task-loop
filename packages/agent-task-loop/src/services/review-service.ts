import type { AgentAdapter } from '../adapters/base';
import type { ReviewVerdict, TargetAgent } from '../types/task';

export interface ReviewResult {
  verdict: ReviewVerdict;
  findings: string;
  sessionId?: string;
  sessionName?: string;
  logPath?: string;
}

interface ParsedReviewPayload {
  verdict: ReviewVerdict;
  findings: string[];
}

function tryParseReviewPayload(raw: string): ParsedReviewPayload | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as ParsedReviewPayload;
    if (
      (parsed.verdict === '通过' || parsed.verdict === '驳回') &&
      Array.isArray(parsed.findings)
    ) {
      return parsed;
    }
  } catch {
    // Fall through and try line-by-line extraction.
  }

  const lines = trimmed
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]!) as ParsedReviewPayload;
      if (
        (parsed.verdict === '通过' || parsed.verdict === '驳回') &&
        Array.isArray(parsed.findings)
      ) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

export class ReviewService {
  constructor(
    private readonly deps: {
      adapter: AgentAdapter;
      command: {
        command: string;
        args: string[];
        env: Record<string, string>;
      };
    },
  ) {}

  async review(input: {
    taskId: string;
    description: string;
    resultSummary?: string;
    workspacePath: string;
    reviewRound: number;
    reviewerAgent: TargetAgent;
    acceptanceFeedback?: string;
    onSpawn?: (payload: { pid?: number }) => void;
    onHeartbeat?: () => void;
    onSession?: (payload: { sessionId?: string; sessionName?: string }) => void;
  }): Promise<ReviewResult> {
    const sessionName = `${input.taskId}-review-${input.reviewerAgent}-r${input.reviewRound}`.toLowerCase();
    let latestSessionId: string | undefined;
    const promptLines = [
      '你是 reviewer，不是实现者。',
      `任务：${input.description}`,
      `本轮结果：${input.resultSummary ?? ''}`,
    ];
    if (input.acceptanceFeedback) {
      promptLines.push(
        '董事长最新验收意见（硬约束）：',
        input.acceptanceFeedback,
        '复核时必须以这些硬约束为准；如果实现已经满足这些要求，就不能再用个人工程偏好、通用最佳实践或“最好再补一个测试”之类的理由驳回。',
        '只有在以下情况才允许驳回：功能仍错误、硬约束未落实、验证失败、或改动引入新的明确回归。',
      );
    }
    promptLines.push('请只输出 JSON：{"verdict":"通过|驳回","findings":["1. ...","2. ..."]}');
    const result = await this.deps.adapter.execute({
      task: {
        taskId: input.taskId,
        title: input.taskId,
        description: input.description,
        project: 'review',
        targetAgent: input.reviewerAgent,
        priority: 0,
        status: '待复核',
      },
      workspacePath: input.workspacePath,
      cwd: input.workspacePath,
      prompt: promptLines.join('\n'),
      command: this.deps.command.command,
      args: this.deps.command.args,
      env: this.deps.command.env,
      sessionName,
      onSpawn: input.onSpawn,
      onHeartbeat: input.onHeartbeat,
      onSession: payload => {
        latestSessionId = payload.sessionId;
        input.onSession?.(payload);
      },
    });

    if (result.status !== 'success') {
      throw new Error(result.error ?? 'review execution failed');
    }

    const parsed = tryParseReviewPayload(result.summary);
    if (!parsed) {
      throw new Error(`review output did not contain a valid verdict JSON: ${result.summary.slice(-400)}`);
    }

    return {
      verdict: parsed.verdict,
      findings: parsed.findings.join('\n'),
      sessionId: latestSessionId,
      sessionName,
    };
  }
}
