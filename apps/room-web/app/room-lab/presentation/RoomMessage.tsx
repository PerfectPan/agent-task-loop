import { isRoomLabAgentId, ROOM_AGENT_ROSTER } from '../domain/agent-roster';
import type { RoomLabEventView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { formatClock } from './format-time';

const labels = new Map<string, string>(ROOM_AGENT_ROSTER.map(agent => [agent.id, agent.label]));

export function RoomMessage({ event }: { event: RoomLabEventView }) {
  const human = event.author.kind === 'human';
  const control = event.author.kind === 'control-plane';
  const agentId = isRoomLabAgentId(event.author.id) ? event.author.id : undefined;
  const name = human ? '董事长' : labels.get(event.author.id) ?? (control ? 'Room' : event.author.id);
  const layout = human
    ? 'max-w-[46rem] self-end'
    : control
      ? 'w-full border-l-2 border-line py-1 pl-2.5 text-muted'
      : 'flex items-start gap-2';
  return (
    <li className={[
      layout,
      event.pending ? 'opacity-70' : '',
      event.failed ? 'outline outline-1 outline-seal' : '',
    ].filter(Boolean).join(' ')}>
      {!human && agentId && <AgentAvatar agentId={agentId} className="size-8 shrink-0 rounded-full object-cover" />}
      <article className="min-w-0 max-w-full">
        <header className={`mb-0.5 flex items-baseline gap-2 leading-tight ${human ? 'justify-end' : ''}`}>
          <strong className={`font-semibold ${control ? 'text-xs' : 'text-xs'}`}>{name}</strong>
          <time className="whitespace-nowrap text-xs text-muted" dateTime={event.at}>{formatClock(event.at)}</time>
          <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100">#{event.seq}</span>
        </header>
        <p className={[
          'm-0 max-w-[72ch] text-sm leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]',
          human ? 'rounded-xl rounded-br-sm bg-human px-3 py-2' : '',
          control ? 'text-xs' : '',
        ].join(' ')}>
          {event.body.split(/(@(?:all|claude-relay|claude|codex|opencode|dsh)\b)/gi)
            .map((part, index) => /^@(all|claude-relay|claude|codex|opencode|dsh)$/i.test(part)
              ? <span className="text-hydrangea" key={index}>{part}</span> : part)}
        </p>
        {event.addressedTo.length > 0 && <span className="sr-only">
          提及：{event.addressedTo.map(id => labels.get(id) ?? id).join('、')}
        </span>}
      </article>
    </li>
  );
}
