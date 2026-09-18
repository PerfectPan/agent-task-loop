import { ArrowUp } from '@phosphor-icons/react/dist/ssr/ArrowUp';
import { ArrowDown } from '@phosphor-icons/react/dist/ssr/ArrowDown';
import { Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Minus } from '@phosphor-icons/react/dist/ssr/Minus';
import type { RoomLabAgentId, RoomLabAgentView } from '../read-model';
import { AgentMark } from './AgentMark';
import { agentAvailabilityLabels } from './agent-availability';
import { agentRoleLabels } from './agent-role';
import { copy } from './copy';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { sectionLabel } from './ui';

/** CLI availability, not member state: runnable reads as info, installed-but-
 *  not-runnable as warning, absent as the neutral chip. */
const availabilityVariant = {
  runnable: 'info',
  found: 'warning',
  missing: 'muted',
} as const;

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
    <section aria-label="成员与发言顺序" className="flex flex-col gap-2">
      <p className="m-0 text-[13px] leading-relaxed text-foreground/75">
        {copy.say.crewExplain}
      </p>
      <ol className="m-0 flex list-none flex-col p-0">
        {activeAgents.map((agent, index) => (
          <li key={agent.id} className="flex items-center gap-2 border-b border-border py-2">
            <span className="tabular-nums w-3 text-xs text-muted-foreground">{index + 1}</span>
            <AgentMark agentId={agent.id} size={22} />
            <div className="min-w-0 flex-1">
              <strong className="block text-sm font-medium [overflow-wrap:anywhere]">{agent.label}</strong>
              <small className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant={availabilityVariant[agent.availability]}>{agentAvailabilityLabels[agent.availability]}</Badge>
                <span>{agentRoleLabels[agent.id]}</span>
              </small>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="icon-sm" disabled={disabled || index === 0} onClick={() => move(index, -1)}
                aria-label={`将 ${agent.label} 上移`}><ArrowUp size={15} /></Button>
              <Button variant="outline" size="icon-sm" disabled={disabled || index === activeAgents.length - 1} onClick={() => move(index, 1)}
                aria-label={`将 ${agent.label} 下移`}><ArrowDown size={15} /></Button>
              <Button variant="outline" size="icon-sm" disabled={disabled || activeAgents.length === 1}
                onClick={() => onCompose(activeAgentIds.filter(id => id !== agent.id))}
                aria-label={`移除 ${agent.label}`}><Minus size={15} /></Button>
            </div>
          </li>
        ))}
      </ol>
      {agents.some(agent => !activeAgentIds.includes(agent.id)) && <>
        <h3 className={`${sectionLabel} mt-2`}>{copy.label.joinable}</h3>
        <ul className="m-0 flex list-none flex-col p-0">
          {agents.filter(agent => !activeAgentIds.includes(agent.id)).map(agent => (
            <li key={agent.id} className="flex items-center gap-2 border-b border-border py-2 last:border-b-0">
              <span className="w-3" aria-hidden="true" />
              <AgentMark agentId={agent.id} size={22} className="opacity-70" />
              <div className="min-w-0 flex-1">
                <strong className="block text-sm font-medium [overflow-wrap:anywhere]">{agent.label}</strong>
                <small className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant={availabilityVariant[agent.availability]}>{agentAvailabilityLabels[agent.availability]}</Badge>
                  <span>{agentRoleLabels[agent.id]}</span>
                </small>
              </div>
              <Button variant="outline" size="icon-sm" disabled={disabled} onClick={() => onCompose([...activeAgentIds, agent.id])}
                aria-label={`加入 ${agent.label}`}><Plus size={15} /></Button>
            </li>
          ))}
        </ul>
      </>}
    </section>
  );
}
