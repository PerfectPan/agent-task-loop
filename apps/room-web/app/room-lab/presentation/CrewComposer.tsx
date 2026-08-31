import type {
  RoomLabAgentId,
  RoomLabAgentView,
} from '../read-model';
import styles from './RoomLab.module.css';

const AGENT_MARKS: Record<RoomLabAgentId, string> = {
  'claude-relay': 'CR',
  claude: 'CL',
  codex: 'CX',
  opencode: 'OC',
  dsh: 'DS',
};

export function CrewComposer({
  agents,
  activeAgentIds,
  disabled,
  onCompose,
}: {
  agents: RoomLabAgentView[];
  activeAgentIds: RoomLabAgentId[];
  disabled: boolean;
  onCompose: (agentIds: RoomLabAgentId[]) => void;
}) {
  const agentsById = new Map(agents.map(agent => [agent.id, agent]));
  const activeAgents = activeAgentIds
    .map(agentId => agentsById.get(agentId))
    .filter((agent): agent is RoomLabAgentView => agent !== undefined);

  const add = (agentId: RoomLabAgentId) => onCompose([...activeAgentIds, agentId]);
  const remove = (agentId: RoomLabAgentId) => {
    onCompose(activeAgentIds.filter(candidate => candidate !== agentId));
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= activeAgentIds.length) return;
    const next = [...activeAgentIds];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onCompose(next);
  };

  return (
    <aside className={styles.crewPanel} aria-labelledby="crew-title">
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.kicker}>ROOM COMPOSITION</span>
          <h2 id="crew-title">Compose the room</h2>
        </div>
        <strong>{activeAgentIds.length} of {agents.length} active</strong>
      </header>

      <section className={styles.catalogSection} aria-labelledby="available-agents-title">
        <h3 id="available-agents-title">Available agents</h3>
        <ul className={styles.agentCatalog}>
          {agents.map(agent => {
            const active = activeAgentIds.includes(agent.id);
            return (
              <li key={agent.id} className={active ? styles.catalogAgentActive : undefined}>
                <span className={`${styles.agentMark} ${styles[`mark_${agent.id}`]}`} aria-hidden="true">
                  {AGENT_MARKS[agent.id]}
                </span>
                <span className={styles.agentIdentity}>
                  <strong>{agent.label}</strong>
                  <small>{agent.role}</small>
                </span>
                <span className={[
                  styles.miniStatus,
                  styles[`miniStatus_${agent.status}`],
                ].filter(Boolean).join(' ')}>
                  {agent.status}
                </span>
                {active ? (
                  <span className={styles.activeLabel}>Active</span>
                ) : (
                  <button type="button" disabled={disabled} onClick={() => add(agent.id)}>
                    Add
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.activeCrewSection} aria-labelledby="active-crew-title">
        <div className={styles.sectionHeading}>
          <h3 id="active-crew-title">Active crew</h3>
          <span>Count-off order</span>
        </div>
        <ol className={styles.activeCrew}>
          {activeAgents.map((agent, index) => (
            <li key={agent.id}>
              <span className={styles.portNumber}>{index + 1}</span>
              <span className={`${styles.agentMark} ${styles[`mark_${agent.id}`]}`} aria-hidden="true">
                {AGENT_MARKS[agent.id]}
              </span>
              <strong>{agent.label}</strong>
              <span className={styles.reorderActions} aria-label={`Reorder ${agent.label}`}>
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move ${agent.label} earlier`}
                >
                  Up
                </button>
                <button
                  type="button"
                  disabled={disabled || index === activeAgents.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${agent.label} later`}
                >
                  Down
                </button>
              </span>
              <button
                type="button"
                className={styles.removeAgent}
                disabled={disabled || activeAgents.length === 1}
                onClick={() => remove(agent.id)}
                aria-label={`Remove ${agent.label} from the Room`}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <p>Order controls the count-off. Chat without mentions wakes every active seat.</p>
      </section>
    </aside>
  );
}
