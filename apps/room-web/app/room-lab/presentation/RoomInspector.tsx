import type {
  RoomLabAgentId,
  RoomLabAgentView,
  RoomLabState,
} from '../read-model';
import { CountOffStrip } from './CountOffStrip';
import { TaskStrip } from './TaskStrip';
import styles from './RoomLab.module.css';

export function RoomInspector({
  state,
  disabled,
  onRetry,
}: {
  state: RoomLabState;
  disabled: boolean;
  onRetry: (agentId: RoomLabAgentId) => void;
}) {
  const taskGateReady = state.activeAgentIds.includes('codex') &&
    state.activeAgentIds.includes('claude');
  const heldAgents = state.agents.filter(agent =>
    agent.active && agent.heldUpToSeq !== undefined,
  );

  return (
    <aside className={styles.inspectorPanel} aria-labelledby="inspector-title">
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.kicker}>LIVE PROOF</span>
          <h2 id="inspector-title">Run inspector</h2>
        </div>
      </header>

      <section className={styles.runStatus} aria-label="Room run status">
        <span className={state.busy ? styles.busyDot : styles.readyDot} />
        <div>
          <strong>{state.busy ? 'Agents in flight' : 'Room is live'}</strong>
          <small>SEQ {String(state.head).padStart(3, '0')} · revision {state.revision}</small>
        </div>
      </section>

      <section className={styles.inspectorSection}>
        <div className={styles.sectionHeading}>
          <h3>Count-off order</h3>
          <span>{state.activeAgentIds.length} seats</span>
        </div>
        {state.countOff ? (
          <CountOffStrip run={state.countOff} agents={state.agents} />
        ) : (
          <p className={styles.inspectorEmpty}>
            Run a count-off to prove every selected seat can read and write the same Room stream.
          </p>
        )}
      </section>

      <section className={styles.taskGateSection} aria-labelledby="task-gate-title">
        <div className={styles.sectionHeading}>
          <h3 id="task-gate-title">Task gate</h3>
          <span className={taskGateReady ? styles.gateReady : styles.gateBlocked}>
            {taskGateReady ? 'Ready' : 'Needs seats'}
          </span>
        </div>
        <p>Delivery is constrained to a separate implementation and review seat.</p>
        <dl className={styles.gateSeats}>
          <div>
            <dt>Implementation</dt>
            <dd className={state.activeAgentIds.includes('codex') ? styles.seatReady : undefined}>
              Codex
            </dd>
          </div>
          <div>
            <dt>Independent review</dt>
            <dd className={state.activeAgentIds.includes('claude') ? styles.seatReady : undefined}>
              Claude
            </dd>
          </div>
        </dl>
        {state.task && <TaskStrip task={state.task} />}
      </section>

      {heldAgents.length > 0 && (
        <section className={styles.heldSection} aria-labelledby="held-title">
          <div className={styles.sectionHeading}>
            <h3 id="held-title">Held drafts</h3>
            <span>{heldAgents.length}</span>
          </div>
          {heldAgents.map(agent => (
            <HeldDraft key={agent.id} agent={agent} disabled={disabled} onRetry={onRetry} />
          ))}
        </section>
      )}
    </aside>
  );
}

function HeldDraft({
  agent,
  disabled,
  onRetry,
}: {
  agent: RoomLabAgentView;
  disabled: boolean;
  onRetry: (agentId: RoomLabAgentId) => void;
}) {
  return (
    <article className={styles.heldDraft}>
      <strong>{agent.label}</strong>
      <small>Held at SEQ {agent.heldUpToSeq}</small>
      <p>{agent.lastDraft}</p>
      <button type="button" disabled={disabled} onClick={() => onRetry(agent.id)}>
        Catch up and retry
      </button>
    </article>
  );
}
