import type { RoomLabAgentId, RoomLabState } from '../read-model';
import { CountOffStrip } from './CountOffStrip';
import { TaskStrip } from './TaskStrip';
import { AgentAvatar } from './AgentAvatar';
import { agentStatusLabels } from './agent-status';
import { quietButton } from './ui';

export function RoomInspector({ state, disabled, onRetry }: {
  state: RoomLabState; disabled: boolean; onRetry: (agentId: RoomLabAgentId) => void;
}) {
  const activeAgents = state.activeAgentIds.flatMap(id => state.agents.filter(agent => agent.id === id));
  const taskGateReady = state.activeAgentIds.includes('codex') && state.activeAgentIds.includes('claude');
  return (
    <div className="text-sm leading-relaxed">
      <p className="text-xs text-muted">房间 {state.roomId} · 最新消息 #{state.head} · revision {state.revision}</p>
      <section className="border-b border-line py-4" aria-labelledby="connection-title">
        <h3 id="connection-title" className="mb-2 text-base">检查连接</h3>
        <p className="my-2 [overflow-wrap:anywhere]">按成员顺序报数，确认每位 Agent 能读写同一段对话。空闲状态不代表 CLI 已通过连接验证。</p>
        {state.countOff ? <CountOffStrip run={state.countOff} agents={state.agents} />
          : <p className="text-xs text-muted">还没有检查记录。从侧栏发起一次检查连接。</p>}
      </section>
      <section className="border-b border-line py-4" aria-labelledby="task-gate-title">
        <h3 id="task-gate-title" className="mb-2 text-base">Task 约束</h3>
        <p className="my-2 [overflow-wrap:anywhere]">Codex 负责实施，Claude 独立审核；最多两轮。模型审核与人工验收是两道不同的关口。</p>
        {!taskGateReady && <p className="rounded-lg bg-[#f9e6df] px-3 py-2 text-seal">请先将 Codex 和 Claude 都加入房间。</p>}
        {state.task ? <TaskStrip task={state.task} /> : <p className="text-xs text-muted">当前没有 Task，可从对话右上角创建。</p>}
      </section>
      <section className="py-4 pb-0" aria-labelledby="agent-status-title">
        <h3 id="agent-status-title" className="mb-2 text-base">成员状态</h3>
        <ul className="mt-2 list-none p-0">
          {activeAgents.map(agent => (
            <li key={agent.id} className="border-b border-line py-3">
              <div className="flex items-center gap-2">
                <AgentAvatar agentId={agent.id} className="size-9 rounded-full object-cover" />
                <strong>{agent.label}</strong>
                <span className="ml-auto text-xs text-muted">{agentStatusLabels[agent.status]}</span>
              </div>
              <p className="mt-1 text-xs text-muted">已读到 #{agent.seenSeq}
                {agent.latencyMs !== undefined ? ` · 用时 ${(agent.latencyMs / 1000).toFixed(1)} 秒` : ''}
                {agent.retryAttempt !== undefined ? ` · 追平尝试 ${agent.retryAttempt}` : ''}
              </p>
              {agent.error && <p className="mt-2 rounded-lg bg-[#f9e6df] px-3 py-2 text-seal">{agent.error}</p>}
              {agent.heldUpToSeq !== undefined && (
                <div className="mt-2 rounded-[10px] bg-gold/80 p-3">
                  <strong>未进入对话的草稿</strong>
                  <p className="my-1">发送前发现 #{agent.heldUpToSeq} 有更新，需要先读取新消息。</p>
                  {agent.lastDraft && <pre className="max-h-52 overflow-auto whitespace-pre-wrap bg-paper p-2 font-sans text-sm [overflow-wrap:anywhere]">{agent.lastDraft}</pre>}
                  <button type="button" className={`${quietButton} mt-2 bg-ink text-washi hover:bg-ink`} disabled={disabled} onClick={() => onRetry(agent.id)}>读取更新并重答</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
