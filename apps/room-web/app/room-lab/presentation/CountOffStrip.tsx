import type { CountOffSnapshot } from '../domain/count-off-run';
import type { RoomLabAgentView } from '../read-model';
import styles from './RoomLab.module.css';

export function CountOffStrip({
  run,
  agents,
}: {
  run: CountOffSnapshot;
  agents: RoomLabAgentView[];
}) {
  const agentsById = new Map(agents.map(agent => [agent.id, agent]));
  return (
    <section className={styles.countOffStrip} aria-label={`Count-off ${run.runId}`}>
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        Count-off {run.runId} is {run.status}; {run.reports.length} of {run.total} agents reported.
      </p>
      <div className={styles.countOffHeading}>
        <span className={styles.eyebrow}>MONOTONIC ROOM PROOF</span>
        <strong>{run.runId}</strong>
        <small>{run.status === 'completed'
          ? `${run.total} 席已按序进入同一世界`
          : run.status === 'failed'
            ? `停在第 ${run.nextNumber} 席`
            : `等待第 ${run.nextNumber} 席`}</small>
      </div>
      <ol>
        {run.agentIds.map((agentId, index) => {
          const agent = agentsById.get(agentId);
          const report = run.reports.find(item => item.agentId === agentId);
          const active = run.status === 'running' && run.nextNumber === index + 1;
          const failed = run.failedAgentId === agentId;
          return (
            <li
              key={agentId}
              className={report
                ? styles.reported
                : failed
                  ? styles.reportFailed
                  : active
                    ? styles.reporting
                    : undefined}
            >
              <span>{index + 1}</span>
              <strong>{agent?.label ?? agentId}</strong>
              <small>{report
                ? `SEQ ${String(report.seq).padStart(3, '0')}`
                : failed
                  ? 'FAILED'
                  : active
                    ? 'REPORTING'
                    : 'QUEUED'}</small>
            </li>
          );
        })}
      </ol>
      {run.error && <p className={styles.countOffError}>{run.error}</p>}
    </section>
  );
}
