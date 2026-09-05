import type { RoomLabAgentId, RoomLabState } from '../read-model';
import { CountOffStrip } from './CountOffStrip';
import { TaskStrip } from './TaskStrip';
import { AgentAvatar } from './AgentAvatar';
import { agentStatusLabels } from './agent-status';
import styles from './RoomDetails.module.css';

export function RoomInspector({ state, disabled, onRetry }: {
  state: RoomLabState; disabled: boolean; onRetry: (agentId: RoomLabAgentId) => void;
}) {
  const activeAgents = state.activeAgentIds.flatMap(id => state.agents.filter(agent => agent.id === id));
  const taskGateReady = state.activeAgentIds.includes('codex') && state.activeAgentIds.includes('claude');
  return (
    <div className={styles.inspector}>
      <p className={styles.metadata}>房间 {state.roomId} · 最新消息 #{state.head} · revision {state.revision}</p>
      <section aria-labelledby="connection-title">
        <h3 id="connection-title">检查连接</h3>
        <p>按成员顺序报数，确认每位 Agent 能读写同一段对话。空闲状态不代表 CLI 已通过连接验证。</p>
        {state.countOff ? <CountOffStrip run={state.countOff} agents={state.agents} />
          : <p className={styles.empty}>还没有检查记录。从侧栏发起一次检查连接。</p>}
      </section>
      <section aria-labelledby="task-gate-title">
        <h3 id="task-gate-title">Task 约束</h3>
        <p>Codex 负责实施，Claude 独立审核；最多两轮。模型审核与人工验收是两道不同的关口。</p>
        {!taskGateReady && <p className={styles.warning}>请先将 Codex 和 Claude 都加入房间。</p>}
        {state.task ? <TaskStrip task={state.task} /> : <p className={styles.empty}>当前没有 Task，可从对话右上角创建。</p>}
      </section>
      <section aria-labelledby="agent-status-title">
        <h3 id="agent-status-title">成员状态</h3>
        <ul className={styles.agentList}>
          {activeAgents.map(agent => (
            <li key={agent.id}>
              <div className={styles.agentHeading}><AgentAvatar agentId={agent.id} />
                <strong>{agent.label}</strong><span>{agentStatusLabels[agent.status]}</span>
              </div>
              <p className={styles.metadata}>已读到 #{agent.seenSeq}
                {agent.latencyMs !== undefined ? ` · 用时 ${(agent.latencyMs / 1000).toFixed(1)} 秒` : ''}
                {agent.retryAttempt !== undefined ? ` · 追平尝试 ${agent.retryAttempt}` : ''}
              </p>
              {agent.error && <p className={styles.error}>{agent.error}</p>}
              {agent.heldUpToSeq !== undefined && (
                <div className={styles.heldDraft}>
                  <strong>未进入对话的草稿</strong>
                  <p>发送前发现 #{agent.heldUpToSeq} 有更新，需要先读取新消息。</p>
                  {agent.lastDraft && <pre>{agent.lastDraft}</pre>}
                  <button type="button" disabled={disabled} onClick={() => onRetry(agent.id)}>读取更新并重答</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
