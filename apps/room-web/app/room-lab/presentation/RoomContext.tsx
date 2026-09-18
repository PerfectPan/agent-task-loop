import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react/dist/ssr/X';
import type { RoomLabAgentId, RoomLabAgentView, RoomLabState } from '../read-model';
import { AgentMark } from './AgentMark';
import { CountOffStrip } from './CountOffStrip';
import { CrewComposer } from './CrewComposer';
import { agentRoleLabels } from './agent-role';
import { agentStatusLabels, agentStatusTone, toneDot, toneText } from './agent-status';
import { formatElapsed, formatLatency } from './format-time';
import type { Round } from './round';
import { sectionLabel } from './ui';
import { copy } from './copy';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { ScrollArea } from '~/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';

const DRAWER_QUERY = '(max-width: 1180px)';

/**
 * Above 1180 the members column is docked beside the sheet; below it, it is a
 * Sheet. Only one of the two is ever mounted, so there is no second copy of the
 * panel's ids or its one retry button in the document. The server renders the
 * docked column, and the swap happens after hydration, so the markup matches.
 */
function useDrawer() {
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DRAWER_QUERY);
    const sync = () => setDrawer(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return drawer;
}

/**
 * The context column. Members here show the same states the thread shows,
 * from the same read model, so the two can never disagree. A held draft's
 * text lives only here: it is not a posted fact and must not read like one.
 */
export function RoomContext({
  state, agents, round, elapsedOf, open, editing, disabled,
  onEditingChange, onClose, onCompose, onRetry, onCountOff,
}: {
  state: RoomLabState; agents: RoomLabAgentView[]; round: Round | undefined;
  elapsedOf: (agentId: RoomLabAgentId) => number | undefined;
  open: boolean; editing: boolean; disabled: boolean;
  onEditingChange: (editing: boolean) => void; onClose: () => void;
  onCompose: (agentIds: RoomLabAgentId[]) => void;
  onRetry: (agentId: RoomLabAgentId) => void;
  onCountOff: () => void;
}) {
  const phaseOf = new Map(round?.turns.map(turn => [turn.agent.id, turn.phase]) ?? []);
  const drawer = useDrawer();
  const panel = (
    <>
      <section className="flex flex-col gap-2" aria-labelledby="members-title">
        <div className="flex h-6 items-center justify-between">
          <h2 id="members-title" className={sectionLabel}>{copy.label.members(agents.length)}</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={() => onEditingChange(!editing)} aria-label={editing ? '完成成员编辑' : copy.action.manageMembers}>
              {editing ? copy.action.done : copy.action.edit}
            </Button>
            <Button variant="ghost" size="icon-xs" className="min-[1180px]:hidden" onClick={onClose} aria-label={copy.action.closeMembers}>
              <X size={16} />
            </Button>
          </div>
        </div>
        {editing ? (
          <CrewComposer agents={state.agents} activeAgentIds={state.activeAgentIds} disabled={disabled} onCompose={onCompose} />
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {agents.map(agent => {
              const tone = agentStatusTone[agent.status];
              const phase = phaseOf.get(agent.id);
              const queued = phase === 'queued';
              const seconds = agent.status === 'running' ? elapsedOf(agent.id) : undefined;
              const retryable = agent.heldUpToSeq !== undefined && !!agent.lastDraft && agent.status !== 'running';
              return (
                <li key={agent.id} className="flex flex-col">
                  <div className="flex items-center gap-2.5 rounded-md px-1 py-[7px]">
                    <AgentMark agentId={agent.id} size={22} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {agent.id}
                      <span className="ml-1.5 text-xs text-muted-foreground">{agentRoleLabels[agent.id]}</span>
                    </span>
                    <span className={`flex shrink-0 items-center gap-1.5 text-xs ${queued ? 'text-muted-foreground' : toneText[tone]}`}>
                      <i aria-hidden="true" className={`inline-block size-1.5 rounded-full ${queued ? 'bg-transparent shadow-[inset_0_0_0_1px_currentColor]' : toneDot[tone]} ${agent.status === 'running' ? 'animate-pulse-soft' : ''}`} />
                      {queued ? copy.status.queued : agentStatusLabels[agent.status]}
                      {seconds !== undefined && <span className="tabular-nums font-mono">{formatElapsed(seconds)}</span>}
                      {seconds === undefined && !queued && agent.latencyMs !== undefined && agent.status !== 'idle' && (
                        <span className="text-muted-foreground">{copy.label.spent} <span className="tabular-nums font-mono">{formatLatency(agent.latencyMs)}</span></span>
                      )}
                    </span>
                  </div>
                  {agent.error && (
                    <p className="m-0 mb-1.5 ml-9 rounded-lg bg-destructive-soft px-3 py-2.5 text-[13px] leading-normal text-destructive-soft-foreground [overflow-wrap:anywhere]">{agent.error}</p>
                  )}
                  {retryable && (
                    <div className="mb-1.5 ml-9 flex flex-col gap-2 rounded-lg bg-warning px-3 py-2.5 text-[13px] leading-normal text-warning-foreground">
                      <p className="m-0">
                        {agent.status === 'error' ? `${copy.say.heldRetryFailed}` : ''}
                        {copy.say.heldExplain}
                        {agent.retryAttempt !== undefined ? copy.say.retried(agent.retryAttempt) : ''}
                      </p>
                      <details>
                        <summary className="cursor-pointer text-xs text-warning-foreground underline decoration-current underline-offset-[3px]">{copy.action.viewDraft}</summary>
                        <pre className="m-0 mt-1.5 max-h-52 overflow-auto rounded-md bg-popover p-2 font-serif text-[13px] leading-[1.7] whitespace-pre-wrap text-popover-foreground [overflow-wrap:anywhere]">{agent.lastDraft}</pre>
                      </details>
                      <Button
                        variant="outline"
                        size="sm"
                        className="self-start border-warning-foreground/40 text-warning-foreground hover:bg-transparent hover:text-warning-foreground"
                        disabled={disabled}
                        onClick={() => onRetry(agent.id)}
                      >
                        {copy.action.retryHeld}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="connection-title">
        <div className="flex h-6 items-center justify-between">
          <h2 id="connection-title" className={sectionLabel}>{copy.label.connection}</h2>
          <Button variant="ghost" size="xs" disabled={disabled} onClick={onCountOff}>
            {state.countOff?.status === 'running' ? copy.action.countingOff : copy.action.startCountOff}
          </Button>
        </div>
        <p className="m-0 text-[13px] leading-relaxed text-foreground/75">
          {copy.say.connectionExplain}
        </p>
        {state.countOff
          ? <CountOffStrip run={state.countOff} />
          : <p className="m-0 text-xs text-muted-foreground">{copy.say.noCountOff}</p>}
      </section>
    </>
  );

  if (drawer) {
    return (
      <Sheet open={open} onOpenChange={next => { if (!next) onClose(); }}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="gap-0 bg-sidebar text-sidebar-foreground"
          aria-label="成员与连接"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{copy.label.membersAndConnection}</SheetTitle>
            <SheetDescription>{copy.say.membersSheet}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-5 px-4 py-[18px]">{panel}</div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground"
      aria-label="成员与连接"
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 px-4 py-[18px]">{panel}</div>
      </ScrollArea>
    </aside>
  );
}
