import { useRef } from 'react';
import { DotsThree } from '@phosphor-icons/react/dist/ssr/DotsThree';
import { Users } from '@phosphor-icons/react/dist/ssr/Users';
import styles from './RoomLab.module.css';

export function RoomHeader({ activeCount, disabled, taskMode, onTask, onMembers, onDetails, onReset }: {
  activeCount: number; disabled: boolean; taskMode: boolean;
  onTask: () => void; onMembers: () => void; onDetails: () => void; onReset: () => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const select = (action: () => void) => {
    if (menuRef.current) menuRef.current.open = false;
    action();
  };
  return (
    <header className={styles.conversationHeader}>
      <div><h1 id="room-heading">产品讨论</h1><p>{activeCount} 位 Agent 参与</p></div>
      <div className={styles.headerActions}>
        <button type="button" className={styles.mobileMembers} onClick={onMembers} aria-label="管理房间成员">
          <Users size={22} />
        </button>
        <button type="button" className={styles.taskButton} onClick={onTask} disabled={disabled}>
          {taskMode ? '返回聊天' : '创建任务'}
        </button>
        <details ref={menuRef} className={styles.roomMenu} onKeyDown={event => {
          if (event.key === 'Escape' && menuRef.current) {
            menuRef.current.open = false;
            menuRef.current.querySelector('summary')?.focus();
          }
        }}>
          <summary aria-label="房间菜单"><DotsThree size={28} weight="bold" /></summary>
          <div className={styles.menuItems}>
            <button type="button" onClick={() => select(onMembers)}>管理成员</button>
            <button type="button" onClick={() => select(onDetails)}>运行详情</button>
            <button type="button" disabled={disabled} onClick={() => select(onReset)}>清空对话</button>
          </div>
        </details>
      </div>
    </header>
  );
}
