import { useEffect, useState } from 'react';
import type { RoomLabAction, RoomLabState } from '../read-model';
import { CrewComposer } from './CrewComposer';
import { RoomSidebar } from './RoomSidebar';
import { RoomHeader } from './RoomHeader';
import { RoomDialog } from './RoomDialog';
import { RoomComposer } from './RoomComposer';
import { RoomInspector } from './RoomInspector';
import { RoomTimeline } from './RoomTimeline';
import { focusRing, quietButton } from './ui';

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
    <main className="grid h-dvh min-h-[420px] grid-cols-[260px_minmax(0,1fr)] bg-paper bg-[url('/images/garden.jpg')] bg-cover bg-center font-sans text-ink max-lg:grid-cols-[220px_minmax(0,1fr)] max-md:flex">
      <a
        className="fixed top-2 left-2 z-50 bg-washi px-3 py-2 -translate-y-[160%] focus:translate-y-0"
        href="#room-command"
      >
        跳到消息输入框
      </a>
      <RoomSidebar rooms={state.catalog} currentRoomId={state.roomId} agents={activeAgents}
        disabled={commandLocked} onCreate={() => setDialog('create')} onManage={() => setDialog('crew')}
        onCountOff={() => { setDialog('details'); onAction({ action: 'count-off' }); }}
        onDetails={() => setDialog('details')} />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-washi/85 backdrop-blur-[10px]" aria-labelledby="room-heading">
        <RoomHeader title={state.title} goal={state.goal} agents={activeAgents}
          running={activeAgents.filter(agent => agent.status === 'running').map(agent => agent.label)}
          disabled={commandLocked}
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
        {error && <div className="mx-4 mt-2 rounded-[10px] bg-[#f6e4de] px-3 py-2 text-xs leading-snug text-seal [overflow-wrap:anywhere]" role="alert">{error}</div>}
        {!taskGateReady && <div className="mx-4 mt-2 flex items-baseline justify-between gap-3 rounded-[10px] bg-gold/70 px-3 py-2 text-xs leading-snug">
          有约束的任务需要 Codex 实施、Claude 独立审核。<button type="button" className="shrink-0 border-0 border-b border-ink bg-transparent p-0" onClick={() => setDialog('crew')}>管理成员</button>
        </div>}
        {attention.length > 0 && <div className="mx-4 mt-2 flex items-baseline justify-between gap-3 rounded-[10px] bg-gold/70 px-3 py-2 text-xs leading-snug" role="status">
          {attention.map(agent => agent.label).join('、')} 的回复需要你看一下。
          <button type="button" className="shrink-0 border-0 border-b border-ink bg-transparent p-0" onClick={() => setDialog('details')}>查看详情</button>
        </div>}
        {state.task && <div className="mx-4 mt-2 flex items-baseline justify-between gap-3 rounded-[10px] bg-gold/70 px-3 py-2 text-xs leading-snug">
          <span className="min-w-0 [overflow-wrap:anywhere]">Task：{state.task.title}</span>
          <button type="button" className="shrink-0 border-0 border-b border-ink bg-transparent p-0" onClick={() => setDialog('details')}>查看任务状态</button>
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
          <label className="my-4 block text-sm">
            这件工作叫什么
            <input
              value={createTitle}
              onChange={event => setCreateTitle(event.currentTarget.value)}
              maxLength={80}
              required
              className={`mt-2 block w-full rounded-[10px] border border-line bg-washi px-3 py-2 text-ink ${focusRing}`}
            />
          </label>
          <button type="submit" className={quietButton}>建房间</button>
        </form>
      </RoomDialog>
    </main>
  );
}
