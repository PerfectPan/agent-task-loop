import type { HeadersFunction, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import type { TaskRecord } from '@rivus/agent-task-loop/task-management';
import type { Lane, LaneId } from '~/board/domain/lanes';
import { loadBoard } from '~/board/application/board.server';

export const headers: HeadersFunction = () => ({
  'Cache-Control': 'no-store, no-cache, must-revalidate',
});

export async function loader({ request }: LoaderFunctionArgs) {
  void request;
  const board = await loadBoard();
  return json(board);
}

/** Exhaustive over LaneId, so a new lane without its own words is a type error. */
const EMPTY_DESCRIPTIONS: Record<LaneId, string> = {
  todo: '没有排队等着开始的任务。',
  running: '没有 agent 正在跑的任务。',
  review: '没有任务在等审核。',
  decide: '没有任务在等你。',
  done: '还没有任务走完。',
};

/**
 * A row, not a card. The lane is the container; giving every task its own
 * border, radius and fill would nest a card inside a card and bury the lane.
 */
function TaskRow({ task }: { task: TaskRecord }) {
  return (
    <Link
      to={`/task/${encodeURIComponent(task.taskId)}`}
      className="flex flex-col gap-1.5 border-b border-line px-1 py-3 text-ink transition-colors last:border-b-0 hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink">{task.title}</h3>
        <span className="shrink-0 text-xs text-muted">{task.status}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="text-ink">{task.project}</span>
        <span aria-hidden>·</span>
        <span>{task.targetAgent}</span>
        {task.source ? (
          <>
            <span aria-hidden>·</span>
            <span>{task.source}</span>
          </>
        ) : null}
      </div>

      {task.progressSummary ? (
        <p className="truncate text-xs text-muted" title={task.progressSummary}>
          {task.progressSummary}
        </p>
      ) : null}
    </Link>
  );
}

function LaneColumn({ lane }: { lane: Lane }) {
  const isDecide = lane.id === 'decide';

  return (
    <section className="flex min-w-0 flex-col rounded-lg bg-washi px-3 py-3">
      <header className="mb-1 flex items-baseline justify-between gap-2 border-b border-line pb-2">
        <h2 className={`text-sm font-semibold ${isDecide ? 'text-moss' : 'text-muted'}`}>
          {lane.title}
        </h2>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            isDecide ? 'bg-moss text-paper' : 'text-muted'
          }`}
        >
          {lane.tasks.length}
        </span>
      </header>

      {lane.tasks.length === 0 ? (
        <p className="px-1 py-3 text-xs text-muted">{EMPTY_DESCRIPTIONS[lane.id]}</p>
      ) : (
        // Bounded so a long finished lane cannot outweigh the four lanes that
        // still need something from someone.
        <div className="flex max-h-[28rem] flex-col overflow-y-auto">
          {lane.tasks.map(task => (
            <TaskRow key={task.taskId} task={task} />
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

  const waiting = data.lanes.find(lane => lane.id === 'decide')?.tasks.length ?? 0;

  return (
    <main className="min-h-screen bg-paper px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">任务看板</h1>
          {/* The one fact the columns do not already show: how much is on you. */}
          <p className="text-xs text-muted">
            {waiting > 0 ? `${waiting} 个任务在等你决定` : '没有任务在等你'}
          </p>
        </div>
        {data.sources.length > 0 ? (
          <ul className="flex items-center gap-2 text-xs text-muted">
            <li>来源</li>
            {data.sources.map(source => (
              <li key={source} className="rounded bg-washi px-2 py-1 text-ink">
                {source}
              </li>
            ))}
          </ul>
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