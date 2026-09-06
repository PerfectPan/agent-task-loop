import { ArrowUp } from '@phosphor-icons/react/dist/ssr/ArrowUp';
import { ArrowDown } from '@phosphor-icons/react/dist/ssr/ArrowDown';
import { Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Minus } from '@phosphor-icons/react/dist/ssr/Minus';
import type { RoomLabAgentId, RoomLabAgentView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { agentStatusLabels } from './agent-status';
import styles from './RoomSidebar.module.css';

export function CrewComposer({ agents, activeAgentIds, disabled, onCompose }: {
  agents: RoomLabAgentView[]; activeAgentIds: RoomLabAgentId[];
  disabled: boolean; onCompose: (agentIds: RoomLabAgentId[]) => void;
}) {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const activeAgents = activeAgentIds.map(id => byId.get(id))
    .filter((agent): agent is RoomLabAgentView => agent !== undefined);
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (disabled || target < 0 || target >= activeAgentIds.length) return;
    const next = [...activeAgentIds];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onCompose(next);
  };
  return (
    <section className={styles.crewEditor} aria-label="成员与报数顺序">
      <p>选择一起协作的 Agent。下方顺序也是检查连接时的报数顺序，至少保留一位成员。</p>
      <ol className={styles.editList}>
        {activeAgents.map((agent, index) => (
          <li key={agent.id}>
            <span className={styles.order}>{index + 1}</span><AgentAvatar agentId={agent.id} />
            <div className={styles.editIdentity}><strong>{agent.label}</strong><small>{agentStatusLabels[agent.status]}</small></div>
            <div className={styles.editActions}>
              <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)}
                aria-label={`将 ${agent.label} 上移`}><ArrowUp size={18} /></button>
              <button type="button" disabled={disabled || index === activeAgents.length - 1} onClick={() => move(index, 1)}
                aria-label={`将 ${agent.label} 下移`}><ArrowDown size={18} /></button>
              <button type="button" disabled={disabled || activeAgents.length === 1}
                onClick={() => onCompose(activeAgentIds.filter(id => id !== agent.id))}
                aria-label={`移除 ${agent.label}`}><Minus size={18} /></button>
            </div>
          </li>
        ))}
      </ol>
      {agents.some(agent => !activeAgentIds.includes(agent.id)) && <>
        <h3>可加入的 Agent</h3>
        <ul className={styles.editList}>
          {agents.filter(agent => !activeAgentIds.includes(agent.id)).map(agent => (
            <li key={agent.id}><AgentAvatar agentId={agent.id} />
              <div className={styles.editIdentity}><strong>{agent.label}</strong><small>{agent.role}</small></div>
              <button type="button" disabled={disabled} onClick={() => onCompose([...activeAgentIds, agent.id])}
                aria-label={`加入 ${agent.label}`}><Plus size={18} /></button>
            </li>
          ))}
        </ul>
      </>}
    </section>
  );
}
