import type { CountOffSnapshot } from '../domain/count-off-run';
import type { RoomLabAgentView } from '../read-model';
import styles from './RoomDetails.module.css';

export function CountOffStrip({ run, agents }: { run: CountOffSnapshot; agents: RoomLabAgentView[] }) {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  return (
    <section className={styles.countOffStrip} aria-label={`Count-off ${run.runId}`}>
      <strong role="status" aria-live="polite">{run.status === 'completed' ? `${run.total} 位成员已按序报数`
        : run.status === 'failed' ? `第 ${run.nextNumber} 位成员未完成` : `等待第 ${run.nextNumber} 位成员报数`}</strong>
      <ol>{run.agentIds.map((id, index) => {
        const report = run.reports.find(item => item.agentId === id);
        const active = run.status === 'running' && run.nextNumber === index + 1;
        return <li key={id}><span>{index + 1}</span><strong>{byId.get(id)?.label ?? id}</strong>
          <small>{report ? `已报数 · #${report.seq}` : run.failedAgentId === id ? '失败' : active ? '报数中' : '等待'}</small></li>;
      })}</ol>
      {run.error && <p className={styles.error}>{run.error}</p>}
    </section>
  );
}
