import type { RoomLabTaskView } from '../read-model';
import styles from './RoomDetails.module.css';

const taskLabels: Record<RoomLabTaskView['status'], string> = {
  executing: '正在实施', reviewing: '独立审核中', reworking: '根据意见返工',
  passed: '模型审核通过，待人工验收', 'changes-requested': '仍需修改', failed: '运行失败',
};

export function TaskStrip({ task }: { task: RoomLabTaskView }) {
  return (
    <section className={styles.taskStrip} aria-label={`Task ${task.taskId}`}>
      <strong role="status" aria-live="polite">{taskLabels[task.status]}</strong>
      <p>{task.title}</p>
      <dl>
        <div><dt>轮次</dt><dd>{task.round}/{task.maxRounds}</dd></div>
        <div><dt>{task.occupied ? '当前席位' : '最后席位'}</dt><dd>{task.allowedSeat === 'impl' ? 'Codex 实施' : 'Claude 审核'}</dd></div>
        <div><dt>占用</dt><dd>{task.occupied ? '执行中' : '已释放'}</dd></div>
        <div><dt>审核结论</dt><dd>{task.verdict ?? '尚未给出'}</dd></div>
      </dl>
      {task.findings && <p className={styles.findings}>{task.findings}</p>}
      <small>{task.taskId}</small>
    </section>
  );
}
