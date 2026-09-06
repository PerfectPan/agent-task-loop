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

export function RoomWorkspace({ state, pending, sending, error, value, onValueChange, onAction }: {
  state: RoomLabState; pending: boolean; sending?: boolean; error?: string; value: string;
  onValueChange: (value: string) => void; onAction: (action: RoomLabAction) => void;
}) {
  const [mode, setMode] = useState<'room' | 'task'>('room');
  const [dialog, setDialog] = useState<'crew' | 'details' | 'create'>();
  const [createTitle, setCreateTitle] = useState('');
  const commandLocked = pending && !sending;
  const taskGateReady = state.activeAgentIds.includes('codex') && state.activeAgentIds.includes('claude');
  const activeAgents = state.activeAgentIds.flatMap(id => state.agents.filter(agent => agent.id === id));
  const attention = activeAgents.filter(agent => agent.status === 'error' || agent.heldUpToSeq !== undefined);
  useEffect(() => { if (!taskGateReady) setMode('room'); }, [taskGateReady]);
  const submit = () => {
    if (commandLocked || sending || !value.trim() || (mode === 'task' && !taskGateReady)) return;
    onAction(mode === 'room' ? { action: 'message', body: value } : { action: 'task', title: value });
  };
  return (
    <main className={styles.shell}>
      <a className={styles.skipLink} href="#room-command">跳到消息输入框</a>
      <RoomSidebar rooms={state.catalog} currentRoomId={state.roomId} agents={activeAgents}
        disabled={commandLocked} onCreate={() => setDialog('create')} onManage={() => setDialog('crew')}
        onCountOff={() => { setDialog('details'); onAction({ action: 'count-off' }); }}
        onDetails={() => setDialog('details')} />
      <section className={styles.conversationWorkspace} aria-labelledby="room-heading">
        <RoomHeader title={state.title} agents={activeAgents} disabled={commandLocked}
          taskMode={mode === 'task'}
          onTask={() => {
            if (mode === 'task') setMode('room');
            else if (taskGateReady) setMode('task');
            else setDialog('crew');
          }}
          onMembers={() => setDialog('crew')} onDetails={() => setDialog('details')}
          onReset={() => {
            if (window.confirm('清空当前房间的对话和 Task？房间本身还在。')) onAction({ action: 'reset' });
          }} />
        {error && <div className={styles.errorBanner} role="alert">{error}</div>}
        {!taskGateReady && <div className={styles.notice}>
          有约束的任务需要 Codex 实施、Claude 独立审核。<button type="button" onClick={() => setDialog('crew')}>管理成员</button>
        </div>}
        {attention.length > 0 && <div className={styles.notice} role="status">
          {attention.map(agent => agent.label).join('、')} 的回复需要你看一下。
          <button type="button" onClick={() => setDialog('details')}>查看详情</button>
        </div>}
        {state.task && <div className={styles.notice}>
          <span>Task：{state.task.title}</span>
          <button type="button" onClick={() => setDialog('details')}>查看任务状态</button>
        </div>}
        <RoomTimeline events={state.events} head={state.head} agents={state.agents} />
        <RoomComposer mode={mode} value={value} disabled={commandLocked || !!sending}
          activeAgentIds={state.activeAgentIds}
          taskGateReady={taskGateReady} onModeChange={setMode} onValueChange={onValueChange} onSubmit={submit} />
      </section>
      <RoomDialog title="管理成员" open={dialog === 'crew'} onClose={() => setDialog(undefined)}>
        <CrewComposer agents={state.agents} activeAgentIds={state.activeAgentIds} disabled={commandLocked}
          onCompose={agentIds => onAction({ action: 'compose', agentIds })} />
      </RoomDialog>
      <RoomDialog title="运行详情" open={dialog === 'details'} onClose={() => setDialog(undefined)}>
        <RoomInspector state={state} disabled={commandLocked} onRetry={agentId => onAction({ action: 'retry', agentId })} />
      </RoomDialog>
      <RoomDialog title="新建房间" open={dialog === 'create'} onClose={() => setDialog(undefined)}>
        <form onSubmit={event => {
          event.preventDefault();
          if (!createTitle.trim()) return;
          onAction({ action: 'create', title: createTitle });
        }}>
          <label className={styles.createField}>
            这件工作叫什么
            <input value={createTitle} onChange={event => setCreateTitle(event.currentTarget.value)}
              maxLength={80} required />
          </label>
          <button type="submit" className={styles.taskButton}>建房间</button>
        </form>
      </RoomDialog>
    </main>
  );
}
