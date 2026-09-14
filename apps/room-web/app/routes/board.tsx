import type { HeadersFunction, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import type { TaskRecord } from '@rivus/agent-task-loop/task-management';
import type { Lane } from '~/board/domain/lanes';
import { loadBoard } from '~/board/application/board.server';

export const headers: HeadersFunction = () => ({
  'Cache-Control': 'no-store, no-cache, must-revalidate',
});

export async function loader({ request }: LoaderFunctionArgs) {
  void request;
  const board = await loadBoard();
  return json(board);
}

const EMPTY_DESCRIPTIONS: Record<string, string> = {
  decide: '当前没有需要你介入裁决的受阻任务。',
  running: '当前没有正在执行或复核修复中的任务。',
  review: '当前没有等待复核或验收的任务。',
  todo: '队列中没有待处理的任务。',
  done: '当前周期内暂无已完成或终止的任务。',
};

function TaskCard({ task }: { task: TaskRecord }) {
  return (
    <article
      tabIndex={0}
      className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-3 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink">{task.title}</h3>
        <span className="shrink-0 rounded bg-washi px-1.5 py-0.5 text-xs font-mono text-muted">
          {task.status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-mono text-ink">{task.project}</span>
        <span>•</span>
        <span>{task.targetAgent}</span>
        {task.source ? (
          <>
            <span>•</span>
            <span className="rounded bg-washi px-1 text-muted">{task.source}</span>
          </>
        ) : null}
      </div>

      {task.progressSummary ? (
        <p className="truncate text-xs text-muted" title={task.progressSummary}>
          {task.progressSummary}
        </p>
      ) : null}
    </article>
  );
}

function LaneColumn({ lane }: { lane: Lane }) {
  const isDecide = lane.id === 'decide';
  const emptyText = EMPTY_DESCRIPTIONS[lane.id] ?? '当前泳道无任务。';

  return (
    <section className="flex flex-col min-w-0 rounded-lg bg-washi p-3">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className={`text-sm font-semibold ${isDecide ? 'text-moss' : 'text-muted'}`}>
          {lane.title}
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isDecide ? 'bg-moss text-paper' : 'bg-line text-muted'
          }`}
        >
          {lane.tasks.length}
        </span>
      </header>

      {lane.tasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line p-6 text-center">
          <p className="text-xs text-muted">{emptyText}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto">
          {lane.tasks.map((task) => (
            <TaskCard key={task.taskId} task={task} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function BoardRoute() {
  const data = useLoaderData<typeof loader>();

  if (data.error) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="w-full rounded-lg border border-line bg-paper p-6 text-ink">
          <h1 className="mb-2 text-base font-semibold text-ink">看板加载失败</h1>
          <p className="text-sm text-muted">{data.error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">任务看板</h1>
          <p className="text-xs text-muted">监控并跟踪各后端任务执行与决策状态</p>
        </div>
        {data.sources.length > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span>来源:</span>
            {data.sources.map((source) => (
              <span key={source} className="rounded bg-washi px-1.5 py-0.5 font-mono text-ink">
                {source}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-5 min-[900px]:items-start">
        {data.lanes.map((lane) => (
          <LaneColumn key={lane.id} lane={lane} />
        ))}
      </div>
    </main>
  );
}