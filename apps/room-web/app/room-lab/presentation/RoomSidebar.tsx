import { WifiHigh } from '@phosphor-icons/react/dist/ssr/WifiHigh';
import { SlidersHorizontal } from '@phosphor-icons/react/dist/ssr/SlidersHorizontal';
import { LockSimple } from '@phosphor-icons/react/dist/ssr/LockSimple';
import type { RoomLabAgentView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { agentStatusLabels } from './agent-status';
import styles from './RoomSidebar.module.css';

export function RoomSidebar({ agents, disabled, onManage, onCountOff, onDetails }: {
  agents: RoomLabAgentView[]; disabled: boolean; onManage: () => void;
  onCountOff: () => void; onDetails: () => void;
}) {
  return (
    <aside className={styles.sidebar} aria-label="本地工作区">
      <div className={styles.brand}>
        <img src="/images/rivus-studio.png" width={270} height={118} alt="Rivus" />
        <p>本地工作区</p>
      </div>
      <div className={styles.roomSection}><span>当前房间</span>
        <a className={styles.activeRoom} href="#room-heading" aria-current="page">#&nbsp; 产品讨论</a>
      </div>
      <div className={styles.rosterHeading}>
        <span>房间成员</span>
        <button type="button" onClick={onManage} aria-label="管理房间成员" title="管理成员与报数顺序">
          <SlidersHorizontal size={20} />
        </button>
      </div>
      <ul className={styles.roster}>
        {agents.map(agent => (
          <li key={agent.id}>
            <AgentAvatar agentId={agent.id} className={styles.avatar} />
            <div><strong>{agent.label}</strong>
              <span className={styles.status} data-status={agent.status}>
                <i aria-hidden="true" />{agentStatusLabels[agent.status]}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <footer className={styles.footer}>
        <button type="button" disabled={disabled} onClick={onCountOff}>
          <WifiHigh size={24} />{disabled ? '运行中…' : '检查连接'}
        </button>
        <button type="button" onClick={onDetails} title="查看本地运行详情">
          <LockSimple size={23} />仅在本地运行
        </button>
        <small>会话保存在内存中，服务重启后清空。</small>
      </footer>
    </aside>
  );
}
