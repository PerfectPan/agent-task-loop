import { isRoomLabAgentId, ROOM_AGENT_ROSTER } from '../domain/agent-roster';
import type { RoomLabEventView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import styles from './RoomTimeline.module.css';

const labels = new Map<string, string>(ROOM_AGENT_ROSTER.map(agent => [agent.id, agent.label]));

export function RoomMessage({ event }: { event: RoomLabEventView }) {
  const human = event.author.kind === 'human';
  const control = event.author.kind === 'control-plane';
  const agentId = isRoomLabAgentId(event.author.id) ? event.author.id : undefined;
  const name = human ? '董事长' : labels.get(event.author.id) ?? (control ? 'Room' : event.author.id);
  return (
    <li className={human ? styles.humanMessage : control ? styles.controlMessage : styles.agentMessage}>
      {!human && agentId && <AgentAvatar agentId={agentId} className={styles.avatar} />}
      <article>
        <header><strong>{name}</strong><time dateTime={event.at}>
          {new Date(event.at).toLocaleTimeString('zh-CN', {
            hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai',
          })}
        </time><span className={styles.sequence}>#{event.seq}</span></header>
        <p>{event.body.split(/(@(?:all|claude-relay|claude|codex|opencode|dsh)\b)/gi)
          .map((part, index) => /^@(all|claude-relay|claude|codex|opencode|dsh)$/i.test(part)
            ? <span className={styles.mention} key={index}>{part}</span> : part)}</p>
        {event.addressedTo.length > 0 && <span className={styles.srOnly}>
          提及：{event.addressedTo.map(id => labels.get(id) ?? id).join('、')}
        </span>}
      </article>
    </li>
  );
}
