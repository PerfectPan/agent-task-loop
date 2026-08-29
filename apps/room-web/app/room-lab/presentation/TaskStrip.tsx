import type { RoomLabTaskView } from '../read-model';
import styles from './RoomLab.module.css';

export function TaskStrip({ task }: { task: RoomLabTaskView }) {
  const terminal = !task.occupied && ['passed', 'changes-requested', 'failed'].includes(task.status);
  const runLabel = terminal ? 'TASK DELIVERY COMPLETE' : 'OCCUPIED TASK RUN';
  const seatLabel = terminal ? 'last seat' : 'allowed seat';

  return (
    <section
      className={styles.taskStrip}
      aria-label={`Task ${task.taskId}`}
    >
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        Task {task.taskId}, round {task.round} of {task.maxRounds}, gate{' '}
        {task.verdict ?? task.status}, lease {task.occupied ? 'occupied' : 'released'}.
      </p>
      <div>
        <span className={styles.eyebrow}>{runLabel}</span>
        <strong>{task.taskId}</strong>
      </div>
      <p>{task.title}</p>
      <dl>
        <div>
          <dt>round</dt>
          <dd>{task.round}/{task.maxRounds}</dd>
        </div>
        <div>
          <dt>{seatLabel}</dt>
          <dd>{task.allowedSeat}</dd>
        </div>
        <div>
          <dt>lease</dt>
          <dd>{task.occupied ? 'occupied' : 'released'}</dd>
        </div>
        <div>
          <dt>gate</dt>
          <dd>{task.verdict ?? task.status}</dd>
        </div>
      </dl>
    </section>
  );
}
