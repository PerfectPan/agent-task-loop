import { ROOM_MENTION_SOURCE } from '../domain/room-message';
import type { RoomLabEventView } from '../read-model';
import { AgentMark, HumanMark } from './AgentMark';
import { agentInk } from './agent-color';
import { formatClock } from './format-time';
import { mentionChip } from './mention-chip';
import { copy } from '../copy';

/** Which colour a member wears, looked up on the registry the loader sent. */
export type AgentColorLookup = (agentId: string) => number | undefined;

/**
 * The transcript reads mentions with the server's own grammar, so a chip here
 * and a mention there are the same fact. The captured group is the id without
 * its `@`, which is why the odd positions of the split are ids.
 */
function mentionParts(body: string): string[] {
  return body.split(new RegExp(ROOM_MENTION_SOURCE, 'gi'));
}

export function RoomMessage({ event, colorOf = () => undefined }: {
  event: RoomLabEventView;
  colorOf?: AgentColorLookup;
}) {
  const human = event.author.kind === 'human';
  const control = event.author.kind === 'control-plane';
  const agentId = human || control ? undefined : event.author.id;
  const name = human ? copy.label.human : control ? 'Room' : event.author.id;

  if (control) {
    return (
      <li className="grid grid-cols-[30px_minmax(0,1fr)] gap-3 text-xs text-muted-foreground">
        <span aria-hidden="true" />
        <p className="m-0 max-w-[66ch] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          <span className="mr-2 font-medium">{name}</span>
          <time dateTime={event.at} className="tabular-nums mr-2">{formatClock(event.at)}</time>
          {event.body}
        </p>
      </li>
    );
  }

  return (
    <li
      className={[
        'grid grid-cols-[30px_minmax(0,1fr)] gap-3',
        event.pending ? 'opacity-70' : '',
        event.failed ? 'rounded-sm outline outline-1 outline-destructive outline-offset-4' : '',
      ].filter(Boolean).join(' ')}
    >
      {human ? <HumanMark /> : agentId ? <AgentMark agentId={agentId} color={colorOf(agentId)} /> : <span aria-hidden="true" className="size-[30px] rounded-full bg-border" />}
      <article className="min-w-0">
        <header className="mb-[3px] flex items-baseline gap-2 leading-tight">
          <strong className={`text-sm font-semibold ${human ? 'text-foreground' : agentId ? agentInk(colorOf(agentId)) : ''}`}>{name}</strong>
          <time className="tabular-nums whitespace-nowrap text-xs text-muted-foreground" dateTime={event.at}>{formatClock(event.at)}</time>
          {event.failed && <span className="text-xs text-destructive">{copy.say.sendFailed}</span>}
        </header>
        <p className="m-0 max-w-[66ch] font-serif text-base leading-[1.7] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {mentionParts(event.body).map((part, index) => {
            // A mention reads the same after it is posted as it did while it
            // was being written: the composer's chip, minus the editing.
            const mentionId = index % 2 === 1 ? part.toLowerCase() : undefined;
            const chip = mentionId ? mentionChip(mentionId, colorOf(mentionId)) : undefined;
            return chip
              ? (
                <span className={chip.chipClass} key={index}>
                  <span aria-hidden="true" className={chip.dotClass}>{chip.letters}</span>
                  {chip.text}
                </span>
              )
              : part;
          })}
        </p>
        {event.addressedTo.length > 0 && <span className="sr-only">
          {copy.say.mentioned(event.addressedTo.join('、'))}
        </span>}
      </article>
    </li>
  );
}
