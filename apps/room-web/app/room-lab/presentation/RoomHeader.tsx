import { useRef } from 'react';
import { DotsThree } from '@phosphor-icons/react/dist/ssr/DotsThree';
import { Users } from '@phosphor-icons/react/dist/ssr/Users';
import type { RoomLabAgentView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { Button } from '~/components/ui/button';
import { focusRing } from './ui';

export function RoomHeader({
  title, goal, agents, running, disabled, taskMode, onTask, onMembers, onDetails, onReset,
}: {
  title: string; goal?: string; agents: RoomLabAgentView[]; running: string[]; disabled: boolean; taskMode: boolean;
  onTask: () => void; onMembers: () => void; onDetails: () => void; onReset: () => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const select = (action: () => void) => {
    if (menuRef.current) menuRef.current.open = false;
    action();
  };
  return (
    <header className="mx-4 mt-3 flex shrink-0 items-center justify-between gap-3 rounded-[10px] border border-line/80 bg-washi/90 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center pl-2 max-md:hidden" aria-hidden="true">
          {agents.map(agent => (
            <AgentAvatar
              key={agent.id}
              agentId={agent.id}
              className="-ml-2 size-8 rounded-full border-2 border-washi object-cover"
            />
          ))}
        </div>
        <div className="min-w-0">
          <h1 id="room-heading" className="font-serif text-xl font-semibold leading-tight">{title}</h1>
          <p className="mt-1 truncate text-xs leading-tight text-muted">
            {agents.length} 人在场
            {goal ? ` · ${goal}` : ''}
            {running.length > 0 ? ` · ${running.join('、')} 正在写` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className={`hidden size-8 place-items-center bg-transparent max-md:grid ${focusRing}`}
          onClick={onMembers}
          aria-label="管理房间成员"
        >
          <Users size={22} />
        </button>
        <Button type="button" variant="outline" onClick={onTask} disabled={disabled}>
          {taskMode ? '返回聊天' : '升级为任务'}
        </Button>
        <details
          ref={menuRef}
          className="relative"
          onKeyDown={event => {
            if (event.key === 'Escape' && menuRef.current) {
              menuRef.current.open = false;
              menuRef.current.querySelector('summary')?.focus();
            }
          }}
        >
          <summary
            aria-label="房间菜单"
            className={`flex size-8 list-none items-center justify-center [&::-webkit-details-marker]:hidden ${focusRing}`}
          >
            <DotsThree size={28} weight="bold" />
          </summary>
          <div className="absolute right-0 top-10 z-20 w-44 rounded-[10px] border border-line bg-washi p-1">
            <Button type="button" variant="ghost" className="h-9 w-full justify-start px-3" onClick={() => select(onMembers)}>管理成员</Button>
            <Button type="button" variant="ghost" className="h-9 w-full justify-start px-3" onClick={() => select(onDetails)}>运行详情</Button>
            <Button type="button" variant="ghost" className="h-9 w-full justify-start px-3" disabled={disabled} onClick={() => select(onReset)}>清空对话</Button>
          </div>
        </details>
      </div>
    </header>
  );
}
