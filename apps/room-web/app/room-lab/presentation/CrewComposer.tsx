import { ArrowUp } from '@phosphor-icons/react/dist/ssr/ArrowUp';
import { ArrowDown } from '@phosphor-icons/react/dist/ssr/ArrowDown';
import { Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Minus } from '@phosphor-icons/react/dist/ssr/Minus';
import type { RoomLabAgentId, RoomLabAgentView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { agentAvailabilityLabels } from './agent-availability';
import { agentStatusLabels } from './agent-status';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

export function CrewComposer({ agents, activeAgentIds, disabled, onCompose }: {
  agents: RoomLabAgentView[]; activeAgentIds: RoomLabAgentId[];
  disabled: boolean; onCompose: (agentIds: RoomLabAgentId[]) => void;
}) {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const activeAgents = activeAgentIds.map(id => byId.get(id))
    .filter((agent): agent is RoomLabAgentView => agent !== undefined);
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (disabled || target < 0 || target >= activeAgentIds.length) return;
    const next = [...activeAgentIds];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onCompose(next);
  };
  return (
    <section aria-label="成员与报数顺序">
      <p className="text-sm leading-relaxed text-muted">
        选择一起协作的 Agent。未安装的也可以入座，发言时才会真正调用本机 CLI。下方顺序也是检查连接时的报数顺序。
      </p>
      <ol className="my-3 list-none p-0">
        {activeAgents.map((agent, index) => (
          <li key={agent.id} className="flex items-center gap-2 border-b border-line py-2">
            <span className="w-3 text-xs text-muted">{index + 1}</span>
            <AgentAvatar agentId={agent.id} className="size-10 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <strong className="block text-sm [overflow-wrap:anywhere]">{agent.label}</strong>
              <small className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <Badge variant={agent.availability}>{agentAvailabilityLabels[agent.availability]}</Badge>
                <span>{agentStatusLabels[agent.status]}</span>
              </small>
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="icon" disabled={disabled || index === 0} onClick={() => move(index, -1)}
                aria-label={`将 ${agent.label} 上移`}><ArrowUp size={18} /></Button>
              <Button type="button" variant="outline" size="icon" disabled={disabled || index === activeAgents.length - 1} onClick={() => move(index, 1)}
                aria-label={`将 ${agent.label} 下移`}><ArrowDown size={18} /></Button>
              <Button type="button" variant="outline" size="icon" disabled={disabled || activeAgents.length === 1}
                onClick={() => onCompose(activeAgentIds.filter(id => id !== agent.id))}
                aria-label={`移除 ${agent.label}`}><Minus size={18} /></Button>
            </div>
          </li>
        ))}
      </ol>
      {agents.some(agent => !activeAgentIds.includes(agent.id)) && <>
        <h3 className="mt-6 text-sm">可加入的 Agent</h3>
        <ul className="my-3 list-none p-0">
          {agents.filter(agent => !activeAgentIds.includes(agent.id)).map(agent => (
            <li key={agent.id} className="flex items-center gap-2 border-b border-line py-2">
              <AgentAvatar agentId={agent.id} className="size-10 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <strong className="block text-sm [overflow-wrap:anywhere]">{agent.label}</strong>
                <small className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge variant={agent.availability}>{agentAvailabilityLabels[agent.availability]}</Badge>
                  <span>{agent.role}</span>
                </small>
              </div>
              <Button type="button" variant="outline" size="icon" disabled={disabled} onClick={() => onCompose([...activeAgentIds, agent.id])}
                aria-label={`加入 ${agent.label}`}><Plus size={18} /></Button>
            </li>
          ))}
        </ul>
      </>}
    </section>
  );
}
