import type { CountOffSnapshot } from '../domain/count-off-run';
import type { RoomLabAgentView } from '../read-model';

export function CountOffStrip({ run, agents }: { run: CountOffSnapshot; agents: RoomLabAgentView[] }) {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  return (
    <section className="mt-3 rounded-[10px] bg-paper p-3" aria-label={`Count-off ${run.runId}`}>
      <strong className="block" role="status" aria-live="polite">{run.status === 'completed' ? `${run.total} 位成员已按序报数`
        : run.status === 'failed' ? `第 ${run.nextNumber} 位成员未完成` : `等待第 ${run.nextNumber} 位成员报数`}</strong>
      <ol className="mt-2 list-none p-0">
        {run.agentIds.map((id, index) => {
          const report = run.reports.find(item => item.agentId === id);
          const active = run.status === 'running' && run.nextNumber === index + 1;
          return (
            <li key={id} className="flex items-baseline gap-3 py-2">
              <span className="text-xs text-muted">{index + 1}</span>
              <strong>{byId.get(id)?.label ?? id}</strong>
              <small className="ml-auto text-xs text-muted">{report ? `已报数 · #${report.seq}` : run.failedAgentId === id ? '失败' : active ? '报数中' : '等待'}</small>
            </li>
          );
        })}
      </ol>
      {run.error && <p className="rounded-lg bg-[#f9e6df] px-3 py-2 text-seal">{run.error}</p>}
    </section>
  );
}
