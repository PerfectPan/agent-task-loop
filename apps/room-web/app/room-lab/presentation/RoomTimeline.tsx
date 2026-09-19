import { useEffect, useRef, useState } from 'react';
import { ArrowDown } from '@phosphor-icons/react/dist/ssr/ArrowDown';
import type { RoomLabAgentId, RoomLabAgentView, RoomLabEventView } from '../read-model';
import { AgentMark } from './AgentMark';
import { RoomMessage, type AgentColorLookup } from './RoomMessage';
import { formatElapsed } from './format-time';
import type { Round } from './round';
import { copy } from './copy';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

/**
 * A state pill: Badge carries the colour pair, this carries 宣纸's pill metrics
 * and lets the text wrap, which a stock badge does not do.
 */
const statePill = 'm-0 w-full justify-start gap-2 whitespace-normal px-2.5 py-[5px] text-left text-[13px] leading-snug';

export function RoomTimeline({ events, head, agents, round, elapsedOf, colorOf }: {
  events: RoomLabEventView[]; head: number; agents: RoomLabAgentView[]; round: Round | undefined;
  elapsedOf: (agentId: RoomLabAgentId) => number | undefined;
  /** Every member the registry knows, not only the ones seated here. */
  colorOf: AgentColorLookup;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const atBottom = useRef(true);
  const lastHead = useRef(head);
  const [unseen, setUnseen] = useState(0);
  const turns = round?.turns.filter(turn => turn.phase !== 'done') ?? [];

  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane) return;
    if (atBottom.current) {
      pane.scrollTop = pane.scrollHeight;
      setUnseen(0);
    } else if (head > lastHead.current) {
      setUnseen(count => count + (head - lastHead.current));
    }
    lastHead.current = head;
  }, [head, turns.length]);

  const jump = () => {
    const pane = scrollRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
    atBottom.current = true;
    setUnseen(0);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <section
        ref={scrollRef}
        // `relative` makes this the containing block for anything positioned
        // inside a message; without it their overflow escapes the scroll clip
        // and stretches the whole document (measured: 6913px tall page).
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pt-[22px] pb-3"
        aria-label="房间对话"
        onScroll={event => {
          const pane = event.currentTarget;
          atBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 100;
          if (atBottom.current) setUnseen(0);
        }}
      >
        <span className="sr-only" role="status" aria-live="polite">{copy.say.received(events.length, head)}</span>
        {events.length === 0 ? (
          <div className="flex min-h-full flex-col justify-end pb-6">
            <div className="mb-3 flex items-center gap-1.5">
              {agents.map(agent => <AgentMark key={agent.id} agentId={agent.id} color={agent.color} size={22} />)}
            </div>
            <h2 className="m-0 mb-1 text-[18px] font-semibold">{copy.say.emptyThreadTitle}</h2>
            <p className="m-0 max-w-[46ch] font-serif text-base leading-[1.7] text-foreground/75">
              {copy.say.emptyThread(agents.length)}
            </p>
          </div>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-[22px] p-0">
            {events.map(event => <RoomMessage key={event.messageId} event={event} colorOf={colorOf} />)}
          </ol>
        )}
        {turns.length > 0 && (
          <ol className="m-0 mt-[22px] flex list-none flex-col gap-3 p-0" aria-label="这一轮">
            {turns.map(({ agent, phase }) => (
              <li key={agent.id} className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-3">
                <AgentMark agentId={agent.id} color={agent.color} className={phase === 'queued' ? 'opacity-55' : ''} />
                {phase === 'now' && (
                  <p className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
                    <span aria-hidden="true" className="animate-pulse-soft inline-block size-1.5 rounded-full bg-info-foreground" />
                    <b className="font-medium text-info-foreground">{agent.id}</b>
                    {copy.status.running}
                    <ElapsedLabel seconds={elapsedOf(agent.id)} />
                  </p>
                )}
                {phase === 'queued' && (
                  <p className="m-0 flex items-center gap-2 text-[13px] text-muted-foreground">
                    <b className="font-medium text-foreground/75">{agent.id}</b>{copy.status.queued}
                  </p>
                )}
                {/* Status only. The draft and its one action live in the members column,
                    so the held state has a single home. */}
                {phase === 'held' && (
                  <Badge variant="warning" className={statePill}>
                    <span>{copy.say.heldInThread(agent.id)}</span>
                  </Badge>
                )}
                {phase === 'error' && (
                  <Badge variant="destructive-soft" className={`${statePill} [overflow-wrap:anywhere]`}>
                    <span>
                      {copy.say.errorInThread(agent.id)}
                      {agent.error ? <span className="block">{agent.error}</span> : null}
                    </span>
                  </Badge>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      {unseen > 0 && (
        <Button
          size="xs"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3.5 shadow-card"
          onClick={jump}
        >
          <ArrowDown size={13} weight="bold" />
          {copy.label.newMessages(unseen)}
        </Button>
      )}
    </div>
  );
}

function ElapsedLabel({ seconds }: { seconds: number | undefined }) {
  if (seconds === undefined) return null;
  return <span className="tabular-nums font-mono text-xs text-muted-foreground">{formatElapsed(seconds)}</span>;
}
