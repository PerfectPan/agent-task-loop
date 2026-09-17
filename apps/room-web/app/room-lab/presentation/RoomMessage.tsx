import { isRoomLabAgentId, ROOM_AGENT_ROSTER } from '../domain/agent-roster';
import type { RoomLabAgentId, RoomLabEventView } from '../read-model';
import { AgentMark, HumanMark } from './AgentMark';
import { formatClock } from './format-time';
import { mentionChip } from './mention-chip';

export const HUMAN_LABEL = '你';

/**
 * The author name is that member's identity colour — the same --chart-N the
 * mark uses, in seating order. Written out one class per member because
 * Tailwind resolves colours by scanning the source for literal class names.
 */
const authorInk: Record<RoomLabAgentId, string> = {
  'claude-relay': 'text-chart-1',
  claude: 'text-chart-2',
  codex: 'text-chart-3',
  opencode: 'text-chart-4',
  dsh: 'text-chart-5',
};

const mentionPattern = new RegExp(
  `(@(?:all|${ROOM_AGENT_ROSTER.map(agent => agent.id).join('|')})\\b)`,
  'gi',
);
const mentionExact = new RegExp(
  `^@(?:all|${ROOM_AGENT_ROSTER.map(agent => agent.id).join('|')})$`,
  'i',
);

export function RoomMessage({ event }: { event: RoomLabEventView }) {
  const human = event.author.kind === 'human';
  const control = event.author.kind === 'control-plane';
  const agentId = isRoomLabAgentId(event.author.id) ? event.author.id : undefined;
  const name = human ? HUMAN_LABEL : control ? 'Room' : event.author.id;

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
      {human ? <HumanMark /> : agentId ? <AgentMark agentId={agentId} /> : <span aria-hidden="true" className="size-[30px] rounded-full bg-border" />}
      <article className="min-w-0">
        <header className="mb-[3px] flex items-baseline gap-2 leading-tight">
          <strong className={`text-sm font-semibold ${human ? 'text-foreground' : agentId ? authorInk[agentId] : ''}`}>{name}</strong>
          <time className="tabular-nums whitespace-nowrap text-xs text-muted-foreground" dateTime={event.at}>{formatClock(event.at)}</time>
          {event.failed && <span className="text-xs text-destructive">没发出去，内容还在输入框里</span>}
        </header>
        <p className="m-0 max-w-[66ch] font-serif text-base leading-[1.7] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {event.body.split(mentionPattern).map((part, index) => {
            // A mention reads the same after it is posted as it did while it
            // was being written: the composer's chip, minus the editing.
            const chip = mentionExact.test(part) ? mentionChip(part.slice(1).toLowerCase()) : undefined;
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
          提及：{event.addressedTo.join('、')}
        </span>}
      </article>
    </li>
  );
}
