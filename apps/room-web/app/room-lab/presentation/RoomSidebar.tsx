import { Link, useLocation } from '@remix-run/react';
import type { RoomCatalogItemView, RoomLabAgentView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { agentRoleLabels } from './agent-role';
import { agentStatusLabels } from './agent-status';
import { formatAgo } from './format-time';
import { Button } from '~/components/ui/button';
import { focusRing, sectionRow } from './ui';

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
  const location = useLocation();
  const onAgents = location.pathname === '/room/agents';
  return (
    <aside
      className="flex min-h-0 flex-col overflow-y-auto border-r border-line/70 bg-garden/55 px-3 py-4 max-md:hidden"
      aria-label="房间"
    >
      <div className="mb-4 flex h-10 items-center gap-2">
        <img src="/images/spirit.png" width={36} height={36} alt="" className="size-9 shrink-0 object-contain" />
        <div>
          <strong className="block text-base font-semibold leading-tight">房间</strong>
          <p className="mt-0.5 text-xs leading-tight text-muted">本地协作</p>
        </div>
      </div>
      <nav className="mb-4 flex gap-1" aria-label="后台">
        <Link
          to={`/room/${currentRoomId}`}
          prefetch="intent"
          preventScrollReset
          aria-current={!onAgents ? 'page' : undefined}
          className={`rounded-md px-2 py-1 text-sm no-underline hover:bg-washi/80 aria-[current=page]:bg-gold ${focusRing}`}
        >
          房间
        </Link>
        <Link
          to="/room/agents"
          prefetch="intent"
          preventScrollReset
          aria-current={onAgents ? 'page' : undefined}
          className={`rounded-md px-2 py-1 text-sm no-underline hover:bg-washi/80 aria-[current=page]:bg-gold ${focusRing}`}
        >
          智能体
        </Link>
      </nav>
      <div className={sectionRow}>
        <span>进行中</span>
        <Button type="button" variant="ghost" size="sm" onClick={onCreate}>新建</Button>
      </div>
      <ul className="mt-2 mb-6 flex flex-col gap-1">
        {rooms.map(room => (
          <li key={room.id}>
            <Link
              to={`/room/${room.id}`}
              prefetch="intent"
              preventScrollReset
              aria-current={room.id === currentRoomId ? 'page' : undefined}
              className={`block rounded-[10px] px-3 py-2 text-ink no-underline hover:bg-washi/80 aria-[current=page]:bg-gold ${focusRing}`}
            >
              <span className="block text-sm font-semibold leading-tight [overflow-wrap:anywhere]">{room.title}</span>
              <span className="mt-0.5 block text-xs leading-tight text-muted">
                {room.memberCount} 人 · {formatAgo(room.updatedAt)}
              </span>
              {room.lastLine && (
                <span className="mt-1 block truncate text-xs leading-tight text-ink/80">{room.lastLine}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div className={sectionRow}>
        <span>在场</span>
        <Button type="button" variant="ghost" size="sm" onClick={onManage} aria-label="管理房间成员">管理成员</Button>
      </div>
      <ul className="mt-2 mb-4 flex flex-col gap-1">
        {agents.map(agent => (
          <li key={agent.id} className="flex min-h-11 items-center gap-2 px-2 py-1">
            <AgentAvatar agentId={agent.id} className="size-10 shrink-0 rounded-full object-cover" />
            <div className="min-w-0">
              <strong className="block text-sm font-semibold leading-tight">{agent.label}</strong>
              <span className="text-xs leading-tight text-muted">
                {agentRoleLabels[agent.id]}
                <span className="mx-1">·</span>
                <span
                  className="inline-flex items-center gap-1.5"
                  data-status={agent.status}
                >
                  <i
                    aria-hidden="true"
                    data-status={agent.status}
                    className="inline-block size-1.5 rounded-full bg-muted data-[status=posted]:bg-moss data-[status=completed]:bg-moss data-[status=silent]:bg-moss data-[status=running]:bg-hydrangea data-[status=held]:bg-hydrangea data-[status=error]:bg-seal"
                  />
                  {agentStatusLabels[agent.status]}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <footer className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={onCountOff}
          className="h-8 justify-start px-2"
        >
          {disabled ? '正在检查…' : '检查连接'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDetails}
          className="h-8 justify-start px-2"
        >
          运行详情
        </Button>
        <Link
          to="/room/agents"
          prefetch="intent"
          className={`h-8 rounded-md px-2 text-sm leading-8 text-moss-deep no-underline hover:bg-garden ${focusRing}`}
        >
          智能体管理
        </Link>
        <small className="text-xs leading-snug text-muted">保存在这台机器上</small>
      </footer>
    </aside>
  );
}
