import { useEffect, useState } from 'react';
import type { RoomLabAction, RoomLabState } from '../read-model';
import { CrewComposer } from './CrewComposer';
import { RoomSidebar } from './RoomSidebar';
import { RoomHeader } from './RoomHeader';
import { RoomDialog } from './RoomDialog';
import { RoomComposer } from './RoomComposer';
import { RoomInspector } from './RoomInspector';
import { RoomTimeline } from './RoomTimeline';
import styles from './RoomLab.module.css';

export function RoomWorkspace({ state, pending, error, value, onValueChange, onAction }: {
  state: RoomLabState; pending: boolean; error?: string; value: string;
  onValueChange: (value: string) => void; onAction: (action: RoomLabAction) => void;
}) {
  const [mode, setMode] = useState<'room' | 'task'>('room');
  const [dialog, setDialog] = useState<'crew' | 'details'>();
  const disabled = pending || state.busy;
  const taskGateReady = state.activeAgentIds.includes('codex') && state.activeAgentIds.includes('claude');
  const activeAgents = state.activeAgentIds.flatMap(id => state.agents.filter(agent => agent.id === id));
  const attention = activeAgents.filter(agent => agent.status === 'error' || agent.heldUpToSeq !== undefined);
  useEffect(() => { if (!taskGateReady) setMode('room'); }, [taskGateReady]);
  const submit = () => {
    if (disabled || !value.trim() || (mode === 'task' && !taskGateReady)) return;
    onAction(mode === 'room' ? { action: 'message', body: value } : { action: 'task', title: value });
  };
  return (
    <main className={styles.shell}>
      <a className={styles.skipLink} href="#room-command">跳到消息输入框</a>
      <RoomSidebar agents={activeAgents} disabled={disabled} onManage={() => setDialog('crew')}
        onCountOff={() => { setDialog('details'); onAction({ action: 'count-off' }); }}
        onDetails={() => setDialog('details')} />
      <section className={styles.conversationWorkspace} aria-labelledby="room-heading">
        <RoomHeader activeCount={activeAgents.length} disabled={disabled} taskMode={mode === 'task'}
          onTask={() => {
            if (mode === 'task') setMode('room');
            else if (taskGateReady) setMode('task');
            else setDialog('crew');
          }}
          onMembers={() => setDialog('crew')} onDetails={() => setDialog('details')}
          onReset={() => {
            if (window.confirm('清空当前对话、Task 和报数记录？此操作无法恢复。')) onAction({ action: 'reset' });
          }} />
        {error && <div className={styles.errorBanner} role="alert">{error}</div>}
        {!taskGateReady && <div className={styles.notice}>
          Task 需要 Codex 和 Claude 一起在房间里。<button type="button" onClick={() => setDialog('crew')}>管理成员</button>
        </div>}
        {attention.length > 0 && <div className={styles.notice} role="status">
          {attention.map(agent => agent.label).join('、')} 的回复需要关注。
          <button type="button" onClick={() => setDialog('details')}>查看详情</button>
        </div>}
        {state.task && <div className={styles.notice}>
          <span>Task：{state.task.title}</span>
          <button type="button" onClick={() => setDialog('details')}>查看任务状态</button>
        </div>}
        <RoomTimeline events={state.events} head={state.head} agents={state.agents} />
        <RoomComposer mode={mode} value={value} disabled={disabled} activeAgentIds={state.activeAgentIds}
          taskGateReady={taskGateReady} onModeChange={setMode} onValueChange={onValueChange} onSubmit={submit} />
      </section>
      <RoomDialog title="管理成员" open={dialog === 'crew'} onClose={() => setDialog(undefined)}>
        <CrewComposer agents={state.agents} activeAgentIds={state.activeAgentIds} disabled={disabled}
          onCompose={agentIds => onAction({ action: 'compose', agentIds })} />
      </RoomDialog>
      <RoomDialog title="运行详情" open={dialog === 'details'} onClose={() => setDialog(undefined)}>
        <RoomInspector state={state} disabled={disabled} onRetry={agentId => onAction({ action: 'retry', agentId })} />
      </RoomDialog>
    </main>
  );
}
