import type { CSSProperties } from 'react';
import type { RoomLabAgentView } from '../read-model';
import { HELD_RETRY_LIMIT } from '../domain/held-retry';
import styles from './RoomLab.module.css';

const AGENT_ACCENTS: Record<RoomLabAgentView['id'], string> = {
  'claude-relay': '#7447d8',
  claude: '#e45d19',
  codex: '#1463ff',
  opencode: '#16825b',
  dsh: '#9a7200',
};

export function AgentPanel({
  agent,
  disabled,
  onRetry,
}: {
  agent: RoomLabAgentView;
  disabled: boolean;
  onRetry: (agent: RoomLabAgentView) => void;
}) {
  const hasHeldDraft = agent.heldUpToSeq !== undefined;
  return (
    <section
      className={styles.agentPanel}
      style={{ '--agent-color': AGENT_ACCENTS[agent.id] } as CSSProperties}
      aria-label={`${agent.label} status`}
    >
      <div className={styles.agentHeading}>
        <div>
          <span className={styles.eyebrow}>LOCAL AGENT / {agent.id.toUpperCase()}</span>
          <h2>{agent.label}</h2>
          <p>{agent.role}</p>
        </div>
        <span
          className={`${styles.statusLamp} ${styles[`status_${agent.status}`]}`}
          role="status"
          aria-live="polite"
        >
          {agent.status}{hasHeldDraft && agent.status !== 'held' ? ' / held' : ''}
        </span>
      </div>

      <dl className={styles.agentMetrics}>
        <div>
          <dt>seen boundary</dt>
          <dd>SEQ {String(agent.seenSeq).padStart(3, '0')}</dd>
        </div>
        <div>
          <dt>latency</dt>
          <dd>{agent.latencyMs ? `${(agent.latencyMs / 1000).toFixed(1)}s` : '—'}</dd>
        </div>
      </dl>

      {agent.retryAttempt !== undefined &&
        (agent.status === 'running' || agent.status === 'held' || agent.status === 'error') && (
          <p className={styles.retryProgress} role="status">
            追平 {agent.retryAttempt}/{HELD_RETRY_LIMIT}
          </p>
        )}

      {agent.status === 'running' && (
        <div className={styles.radar}>
          <span />
          <p>CLI 正在生成草稿</p>
        </div>
      )}

      {agent.lastDraft && (
        <div className={styles.draft}>
          <span>{hasHeldDraft ? 'HELD DRAFT' : 'LAST TRANSMISSION'}</span>
          <p>{agent.lastDraft}</p>
        </div>
      )}

      {hasHeldDraft && (
        <div className={styles.heldBox}>
          <strong>写点被截停</strong>
          <p>
            Room 在发送前发现 SEQ {agent.heldUpToSeq} 已出现更新。读取最新世界后才能重答。
          </p>
          <button type="button" disabled={disabled} onClick={() => onRetry(agent)}>
            读取更新并重答
          </button>
        </div>
      )}

      {agent.error && <p className={styles.agentError}>{agent.error}</p>}
    </section>
  );
}
