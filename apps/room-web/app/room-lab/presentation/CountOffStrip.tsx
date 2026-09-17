import type { CountOffSnapshot } from '../domain/count-off-run';

export function CountOffStrip({ run }: { run: CountOffSnapshot }) {
  const headline = run.status === 'completed'
    ? `${run.total} 位都答上了`
    : run.status === 'failed'
      ? `第 ${run.nextNumber} 位没答上`
      : `等第 ${run.nextNumber} 位回答`;
  return (
    <section className="rounded-lg bg-sidebar-accent p-2.5" aria-label={`检查记录 ${run.runId}`}>
      <strong className="block text-sm font-medium" role="status" aria-live="polite">{headline}</strong>
      <ol className="m-0 mt-1.5 list-none p-0">
        {run.agentIds.map((id, index) => {
          const report = run.reports.find(item => item.agentId === id);
          const active = run.status === 'running' && run.nextNumber === index + 1;
          const failed = run.failedAgentId === id;
          return (
            <li key={id} className="flex items-baseline gap-2.5 py-1 text-[13px]">
              <span className="tabular-nums w-3 text-xs text-muted-foreground">{index + 1}</span>
              <span className="flex-1">{id}</span>
              <small className={`tabular-nums text-xs ${failed ? 'text-destructive-soft-foreground' : active ? 'text-info-foreground' : 'text-muted-foreground'}`}>
                {report ? `答了 · #${report.seq}` : failed ? '没答上' : active ? '回答中' : '等待'}
              </small>
            </li>
          );
        })}
      </ol>
      {run.error && <p className="m-0 mt-1.5 rounded-sm bg-destructive-soft px-2.5 py-[5px] text-xs leading-snug text-destructive-soft-foreground [overflow-wrap:anywhere]">{run.error}</p>}
    </section>
  );
}
