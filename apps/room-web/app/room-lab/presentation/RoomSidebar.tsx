import type { RoomCatalogItemView, RoomLabAgentView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { agentStatusLabels } from './agent-status';
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
        <p>本地工作台</p>
      </div>
      <div className={styles.roomSection}>
        <span>进行中</span>
        <button type="button" className={styles.createRoom} onClick={onCreate}>新建</button>
      </div>
      <ul className={styles.rooms}>
        {rooms.map(room => (
          <li key={room.id}>
            <a href={`/room/${room.id}`} aria-current={room.id === currentRoomId ? 'page' : undefined}>
              {room.title}
            </a>
          </li>
        ))}
      </ul>
      <div className={styles.rosterHeading}>
        <span>在场</span>
        <button type="button" onClick={onManage} aria-label="管理房间成员" title="管理成员与发言顺序">
          成员
        </button>
      </div>
      <ul className={styles.roster}>
        {agents.map(agent => (
          <li key={agent.id}>
            <AgentAvatar agentId={agent.id} className={styles.avatar} />
            <div>
              <strong>{agent.label}</strong>
              <span className={styles.status} data-status={agent.status}>
                <i aria-hidden="true" />{agentStatusLabels[agent.status]}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <footer className={styles.footer}>
        <button type="button" disabled={disabled} onClick={onCountOff}>
          {disabled ? '正在检查…' : '检查连接'}
        </button>
        <button type="button" onClick={onDetails}>运行详情</button>
        <small>工作保存在这台机器上。</small>
      </footer>
    </aside>
  );
}
