import type { CountOffSnapshot } from '../domain/count-off-run';
import { ROOM_AGENT_ROSTER } from '../domain/agent-roster';
import styles from './RoomLab.module.css';

export function CountOffStrip({ run }: { run: CountOffSnapshot }) {
  return (
    <section className={styles.countOffStrip} aria-label={`Count-off ${run.runId}`}>
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        Count-off {run.runId} is {run.status}; {run.reports.length} of {run.total} agents reported.
      </p>
      <div className={styles.countOffHeading}>
        <span className={styles.eyebrow}>MONOTONIC ROOM PROOF</span>
        <strong>{run.runId}</strong>
        <small>{run.status === 'completed'
          ? '六席已按序进入同一世界'
          : run.status === 'failed'
            ? `停在第 ${run.nextNumber} 席`
            : `等待第 ${run.nextNumber} 席`}</small>
      </div>
      <ol>
        {ROOM_AGENT_ROSTER.map((agent, index) => {
          const report = run.reports.find(item => item.agentId === agent.id);
          const active = run.status === 'running' && run.nextNumber === index + 1;
          const failed = run.failedAgentId === agent.id;
          return (
            <li
              key={agent.id}
              className={report
                ? styles.reported
                : failed
                  ? styles.reportFailed
                  : active
                    ? styles.reporting
                    : undefined}
            >
              <span>{index + 1}</span>
              <strong>{agent.label}</strong>
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
