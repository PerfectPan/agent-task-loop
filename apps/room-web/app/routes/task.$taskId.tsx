import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import type { TaskRecord } from '@rivus/agent-task-loop/task-management';
import type { LaneId } from '~/board/domain/lanes';
import { laneOfUnknown } from '~/board/domain/lanes';
import { loadTaskDetail } from '~/board/application/task-detail.server';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const task = data?.task;
  if (task) {
    return [
      { title: `${task.title} · 任务详情 · Rivus` },
      { name: 'description', content: `Rivus 任务看板 - ${task.title}` },
    ];
  }
  return [{ title: '任务详情 · Rivus' }];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const taskId = params.taskId ?? '';
  const detail = await loadTaskDetail(taskId);
  return detail;
}

function hasValue(val: unknown): boolean {
  return val !== undefined && val !== null && String(val).trim() !== '';
}

/**
 * A status is styled by the lane it belongs to, so the badge here and the
 * column on the board can never drift apart. Ten statuses, five vocabularies.
 */
const LANE_BADGE: Record<LaneId, string> = {
  todo: 'bg-muted text-foreground border-border',
  running: 'bg-muted text-info-foreground border-info-foreground/40',
  review: 'bg-muted text-foreground border-warning',
  decide: 'bg-muted text-primary border-primary/40',
  done: 'bg-muted text-muted-foreground border-border',
};

function StatusBadge({ status }: { status: TaskRecord['status'] }) {
  // A backend row can carry a status this build does not know.
  const lane = laneOfUnknown(status);
  const cls = lane ? LANE_BADGE[lane] : 'bg-muted text-foreground border-border';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium border ${cls}`}
    >
      {status}
    </span>
  );
}

function ReviewVerdictBadge({ verdict }: { verdict: string }) {
  const isPass = verdict === '通过';
  const cls = isPass
    ? 'bg-muted text-primary border-primary/40'
    : 'bg-muted text-destructive border-destructive/40';
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${cls}`}
    >
      {verdict}
    </span>
  );
}

function AcceptanceVerdictBadge({ verdict }: { verdict: string }) {
  const isPass = verdict === '通过';
  const cls = isPass
    ? 'bg-muted text-primary border-primary/40'
    : 'bg-muted text-destructive border-destructive/40';
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${cls}`}
    >
      {verdict}
    </span>
  );
}

export default function TaskDetailRoute() {
  const { task, error } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/board"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1.5 py-1 -ml-1.5"
          >
            ← 返回看板
          </Link>
          {task ? (
            <span className="text-xs text-muted-foreground">
              {task.taskId}
            </span>
          ) : null}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {error ? (
          <div className="rounded-lg border border-destructive bg-muted p-6">
            <h2 className="text-base font-semibold text-destructive mb-2">
              无法显示任务
            </h2>
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : task ? (
          <TaskDetailContent task={task} />
        ) : null}
      </main>
    </div>
  );
}

function TaskDetailContent({ task }: { task: TaskRecord }) {
  const isFailed = task.status === '已失败';
  const hasLastError = hasValue(task.lastError);
  const hasProgressSummary = hasValue(task.progressSummary);
  const hasResultSummary = hasValue(task.resultSummary);
  const showProgressSection =
    hasLastError || hasProgressSummary || hasResultSummary;

  const hasReviewRound = hasValue(task.reviewRound);
  const hasReviewVerdict = hasValue(task.reviewVerdict);
  const hasReviewFindings = hasValue(task.reviewFindings);
  const showReviewSection =
    hasReviewRound || hasReviewVerdict || hasReviewFindings;

  const hasAcceptanceRound = hasValue(task.acceptanceRound);
  const hasAcceptanceVerdict = hasValue(task.acceptanceVerdict);
  const hasAcceptanceFeedback = hasValue(task.acceptanceFeedback);
  const reviewPassedWithoutAcceptance =
    task.reviewVerdict === '通过' && !hasAcceptanceVerdict;
  const showAcceptanceSection =
    hasAcceptanceRound ||
    hasAcceptanceVerdict ||
    hasAcceptanceFeedback ||
    reviewPassedWithoutAcceptance;

  const hasPrLink = hasValue(task.prLink);
  const hasPublishBranch = hasValue(task.publishBranch);
  const hasPublishCommit = hasValue(task.publishCommit);
  const hasPublishedAt = hasValue(task.publishedAt);
  const showPublicationSection =
    hasPrLink || hasPublishBranch || hasPublishCommit || hasPublishedAt;

  const hasWorkspacePath = hasValue(task.workspacePath);
  const hasLogPath = hasValue(task.logPath);
  const hasExecutionSessionName = hasValue(task.executionSessionName);
  const hasReviewSessionName = hasValue(task.reviewSessionName);
  const hasLastHeartbeatAt = hasValue(task.lastHeartbeatAt);
  const showRunSection =
    hasWorkspacePath ||
    hasLogPath ||
    hasExecutionSessionName ||
    hasReviewSessionName ||
    hasLastHeartbeatAt;

  return (
    <article className="space-y-8">
      {/* 1. The title, and under it the exact status, the project, the targetAgent and the source that owns this record */}
      <section className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {task.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusBadge status={task.status} />
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            项目：<span className="font-medium text-foreground">{task.project}</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            目标 Agent：<span className="font-medium text-foreground">{task.targetAgent}</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            数据源：<span className="font-medium text-foreground">{task.source}</span>
          </span>
        </div>
      </section>

      {/* 2. description, as prose, preserving its line breaks */}
      {hasValue(task.description) ? (
        <section className="border-t border-border pt-6">
          <div className="max-w-[70ch] text-base leading-relaxed text-foreground whitespace-pre-wrap">
            {task.description}
          </div>
        </section>
      ) : null}

      {/* 3. Progress — progressSummary, resultSummary, lastError. A failed task leads with lastError. */}
      {showProgressSection ? (
        <section className="border-t border-border pt-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">进度</h2>
          <div className="space-y-4 max-w-[70ch]">
            {isFailed && hasLastError ? (
              <div className="rounded-lg border border-destructive bg-muted p-4">
                <span className="block text-xs font-semibold uppercase tracking-wider text-destructive mb-1">
                  失败原因
                </span>
                <p className="max-w-[70ch] text-sm font-medium text-destructive whitespace-pre-wrap">
                  {task.lastError}
                </p>
              </div>
            ) : null}

            {hasProgressSummary ? (
              <div>
                <span className="block text-xs font-medium text-muted-foreground mb-1">
                  进度说明
                </span>
                <p className="max-w-[70ch] text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {task.progressSummary}
                </p>
              </div>
            ) : null}

            {hasResultSummary ? (
              <div>
                <span className="block text-xs font-medium text-muted-foreground mb-1">
                  结果摘要
                </span>
                <p className="max-w-[70ch] text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {task.resultSummary}
                </p>
              </div>
            ) : null}

            {!isFailed && hasLastError ? (
              <div className="rounded-lg border border-destructive bg-muted p-4">
                <span className="block text-xs font-semibold uppercase tracking-wider text-destructive mb-1">
                  上次错误
                </span>
                <p className="max-w-[70ch] text-sm font-medium text-destructive whitespace-pre-wrap">
                  {task.lastError}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 4. Review — reviewRound, reviewVerdict, reviewFindings */}
      {showReviewSection ? (
        <section className="border-t border-border pt-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">评审</h2>
          <div className="space-y-3 max-w-[70ch]">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {hasReviewRound ? (
                <span className="text-muted-foreground">
                  轮次：<span className="font-medium text-foreground">第 {task.reviewRound} 轮</span>
                </span>
              ) : null}
              {hasReviewVerdict && task.reviewVerdict ? (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span>结论：</span>
                  <ReviewVerdictBadge verdict={task.reviewVerdict} />
                </div>
              ) : null}
            </div>

            {hasReviewFindings ? (
              <div>
                <span className="block text-xs font-medium text-muted-foreground mb-1">
                  评审意见
                </span>
                <p className="max-w-[70ch] text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {task.reviewFindings}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 5. Acceptance — acceptanceRound, acceptanceVerdict, acceptanceFeedback. When reviewVerdict is 通过 but there is no acceptanceVerdict, say plainly that the model passed it and a person has not accepted it yet. */}
      {showAcceptanceSection ? (
        <section className="border-t border-border pt-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">验收</h2>
          <div className="space-y-3 max-w-[70ch]">
            {reviewPassedWithoutAcceptance ? (
              <div className="rounded-lg border border-warning bg-muted p-4 text-sm text-foreground">
                模型评审已通过，人工尚未完成最终验收。
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-4 text-sm">
              {hasAcceptanceRound ? (
                <span className="text-muted-foreground">
                  轮次：<span className="font-medium text-foreground">第 {task.acceptanceRound} 轮</span>
                </span>
              ) : null}
              {hasAcceptanceVerdict && task.acceptanceVerdict ? (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span>结论：</span>
                  <AcceptanceVerdictBadge verdict={task.acceptanceVerdict} />
                </div>
              ) : null}
            </div>

            {hasAcceptanceFeedback ? (
              <div>
                <span className="block text-xs font-medium text-muted-foreground mb-1">
                  验收反馈
                </span>
                <p className="max-w-[70ch] text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {task.acceptanceFeedback}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 6. Publication — prLink as a real link when present, publishBranch, publishCommit, publishedAt */}
      {showPublicationSection ? (
        <section className="border-t border-border pt-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">发布</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm max-w-[70ch]">
            {hasPrLink && task.prLink ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">PR 链接</dt>
                <dd className="mt-0.5">
                  <a
                    href={task.prLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-info-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded break-all"
                  >
                    {task.prLink}
                  </a>
                </dd>
              </div>
            ) : null}

            {hasPublishBranch ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">发布分支</dt>
                <dd className="mt-0.5 text-foreground text-xs">
                  {task.publishBranch}
                </dd>
              </div>
            ) : null}

            {hasPublishCommit ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">发布 Commit</dt>
                <dd className="mt-0.5 text-foreground text-xs">
                  {task.publishCommit}
                </dd>
              </div>
            ) : null}

            {hasPublishedAt ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">发布时间</dt>
                <dd className="mt-0.5 text-foreground">
                  {task.publishedAt}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* 7. Run — workspacePath, logPath, executionSessionName, reviewSessionName, lastHeartbeatAt */}
      {showRunSection ? (
        <section className="border-t border-border pt-6 space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">运行</h2>
          <dl className="space-y-3 text-sm max-w-[70ch]">
            {hasWorkspacePath ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">工作区路径</dt>
                <dd className="mt-0.5 max-w-[70ch] font-mono text-xs text-foreground break-all">
                  {task.workspacePath}
                </dd>
              </div>
            ) : null}

            {hasLogPath ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">日志路径</dt>
                <dd className="mt-0.5 max-w-[70ch] font-mono text-xs text-foreground break-all">
                  {task.logPath}
                </dd>
              </div>
            ) : null}

            {hasExecutionSessionName ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">执行会话名称</dt>
                <dd className="mt-0.5 text-foreground">
                  {task.executionSessionName}
                </dd>
              </div>
            ) : null}

            {hasReviewSessionName ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">评审会话名称</dt>
                <dd className="mt-0.5 text-foreground">
                  {task.reviewSessionName}
                </dd>
              </div>
            ) : null}

            {hasLastHeartbeatAt ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">最后心跳时间</dt>
                <dd className="mt-0.5 text-foreground">
                  {task.lastHeartbeatAt}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
    </article>
  );
}
