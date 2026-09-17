import type { RoomLabAgentId } from '../read-model';
import { formatElapsed } from './format-time';
import type { Round, TurnPhase } from './round';
import { Separator } from '~/components/ui/separator';

const dot: Record<TurnPhase, string> = {
  done: 'bg-success-foreground',
  now: 'bg-info-foreground',
  queued: 'bg-transparent shadow-[inset_0_0_0_1px_currentColor]',
  held: 'bg-warning-foreground',
  error: 'bg-destructive',
};

const text: Record<TurnPhase, string> = {
  done: 'text-muted-foreground',
  now: 'text-info-foreground font-medium',
  queued: 'text-muted-foreground',
  held: 'text-warning-foreground',
  error: 'text-destructive',
};

/**
 * The round as a step row, in member order, sitting where the person acts.
 * Filled: spoke. Lit with a counter: speaking now. Outlined: still to come.
 * There is no stop control because the server has no stop.
 */
export function RunStrip({ round, elapsedOf }: {
  round: Round | undefined;
  elapsedOf: (agentId: RoomLabAgentId) => number | undefined;
}) {
  if (!round?.live) return null;
  return (
    <div className="mx-7 shrink-0 text-xs" aria-label="发言顺序">
      <Separator />
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-3.5 gap-y-1.5 p-0 pt-2">
        {round.turns.map(({ agent, phase }) => {
          const seconds = phase === 'now' ? elapsedOf(agent.id) : undefined;
          return (
            <li key={agent.id} className={`flex items-center gap-1.5 ${text[phase]}`} aria-current={phase === 'now' ? 'step' : undefined}>
              <i aria-hidden="true" className={`inline-block size-1.5 rounded-full ${dot[phase]}`} />
              <span>{agent.id}</span>
              {seconds !== undefined && <span className="tabular-nums font-mono">{formatElapsed(seconds)}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
