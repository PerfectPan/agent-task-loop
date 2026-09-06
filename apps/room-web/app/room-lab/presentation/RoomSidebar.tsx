import type { RoomCatalogItemView, RoomLabAgentView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { agentRoleLabels } from './agent-role';
import { agentStatusLabels } from './agent-status';
import { formatAgo } from './format-time';
import styles from './RoomSidebar.module.css';

export function RoomSidebar({
  rooms, currentRoomId, agents, disabled, onCreate, onManage, onCountOff, onDetails,
}: {
  rooms: RoomCatalogItemView[];
  currentRoomId: string;
  agents: RoomLabAgentView[];
  disabled: boolean;
  onCreate: () => void;
  onManage: () => void;
  onCountOff: () => void;
  onDetails: () => void;
}) {
  return (
    <aside className={styles.sidebar} aria-label="房间">
      <div className={styles.brand}>
        <strong>房间</strong>
        <p>本地多 Agent 协作</p>
      </div>
      <div className={styles.roomSection}>
        <span>房间</span>
        <button type="button" className={styles.createRoom} onClick={onCreate}>新建</button>
      </div>
      <ul className={styles.rooms}>
        {rooms.map(room => (
          <li key={room.id}>
            <a href={`/room/${room.id}`} aria-current={room.id === currentRoomId ? 'page' : undefined}>
              <span className={styles.roomTitle}>{room.title}</span>
              <span className={styles.roomMeta}>{room.memberCount} 人 · {formatAgo(room.updatedAt)}</span>
              {room.lastLine && <span className={styles.roomLine}>{room.lastLine}</span>}
            </a>
          </li>
        ))}
      </ul>
      <div className={styles.rosterHeading}>
        <span>班组</span>
        <button type="button" onClick={onManage} aria-label="管理房间成员">改成员</button>
      </div>
      <ul className={styles.roster}>
        {agents.map(agent => (
          <li key={agent.id}>
            <AgentAvatar agentId={agent.id} className={styles.avatar} />
            <div>
              <strong>{agent.label}</strong>
              <span className={styles.role}>{agentRoleLabels[agent.id]}</span>
            </div>
            <span className={styles.status} data-status={agent.status}>{agentStatusLabels[agent.status]}</span>
          </li>
        ))}
      </ul>
      <footer className={styles.footer}>
        <button type="button" disabled={disabled} onClick={onCountOff}>
          {disabled ? '正在检查…' : '检查连接'}
        </button>
        <button type="button" onClick={onDetails}>运行详情</button>
        <small>保存在这台机器上</small>
      </footer>
    </aside>
  );
}
