import type { RoomLabTaskView } from '../read-model';

const taskLabels: Record<RoomLabTaskView['status'], string> = {
  executing: '正在实施', reviewing: '独立审核中', reworking: '根据意见返工',
  passed: '模型审核通过，待人工验收', 'changes-requested': '仍需修改', failed: '运行失败',
  interrupted: '上次执行被中断，不会自动重跑',
};

export function TaskStrip({ task }: { task: RoomLabTaskView }) {
  return (
    <section className="mt-3 rounded-[10px] bg-paper p-3" aria-label={`Task ${task.taskId}`}>
      <strong className="block" role="status" aria-live="polite">{taskLabels[task.status]}</strong>
      <p className="mt-1">{task.title}</p>
      <dl className="my-3 grid grid-cols-2 gap-3">
        <div><dt className="text-xs text-muted">轮次</dt><dd className="mt-1 [overflow-wrap:anywhere]">{task.round}/{task.maxRounds}</dd></div>
        <div><dt className="text-xs text-muted">{task.occupied ? '当前席位' : '最后席位'}</dt><dd className="mt-1">{task.allowedSeat === 'impl' ? 'Codex 实施' : 'Claude 审核'}</dd></div>
        <div><dt className="text-xs text-muted">占用</dt><dd className="mt-1">{task.occupied ? '执行中' : '已释放'}</dd></div>
        <div><dt className="text-xs text-muted">审核结论</dt><dd className="mt-1">{task.verdict ?? '尚未给出'}</dd></div>
      </dl>
      {task.findings && <p className="whitespace-pre-wrap border-t border-line pt-3">{task.findings}</p>}
      <small className="text-[10px] text-muted [overflow-wrap:anywhere]">{task.taskId}</small>
    </section>
  );
}
