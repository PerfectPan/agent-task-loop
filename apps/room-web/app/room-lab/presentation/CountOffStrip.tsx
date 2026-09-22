import type { CountOffSnapshot } from '../domain/count-off-run';
import { copy } from '../copy';

export function CountOffStrip({ run }: { run: CountOffSnapshot }) {
  const headline = run.status === 'completed'
    ? copy.say.countOffPassed(run.total)
    : run.status === 'failed'
      ? copy.say.countOffFailed(run.nextNumber)
      : copy.say.countOffWaiting(run.nextNumber);
  return (
    <section className="rounded-lg bg-sidebar-accent p-2.5" aria-label={copy.label.countOffRecord(run.runId)}>
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
                {report
                  ? `${copy.status.answered} · #${report.seq}`
                  : failed ? copy.status.replyFailed : active ? copy.status.answering : copy.status.waiting}
              </small>
            </li>
          );
        })}
      </ol>
      {run.error && <p className="m-0 mt-1.5 rounded-sm bg-destructive-soft px-2.5 py-[5px] text-xs leading-snug text-destructive-soft-foreground [overflow-wrap:anywhere]">{run.error}</p>}
    </section>
  );
}
