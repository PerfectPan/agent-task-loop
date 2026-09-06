import { useEffect, useRef } from 'react';
import type { RoomLabAgentView, RoomLabEventView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { RoomMessage } from './RoomMessage';

export function RoomTimeline({ events, head, agents }: {
  events: RoomLabEventView[]; head: number; agents: RoomLabAgentView[];
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const atBottom = useRef(true);
  const runningAgents = agents.filter(agent => agent.active && agent.status === 'running');
  useEffect(() => {
    const pane = scrollRef.current;
    if (pane && atBottom.current) pane.scrollTop = pane.scrollHeight;
  }, [head, runningAgents.length]);
  return (
    <section
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
      aria-label="房间对话"
      onScroll={event => {
        const pane = event.currentTarget;
        atBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 100;
      }}
    >
      <span className="sr-only" role="status" aria-live="polite">已收到 {events.length} 条消息，最新序号 {head}。</span>
      {events.length === 0 ? (
        <div className="flex min-h-full flex-col justify-center px-1 py-6">
          <div className="mb-3 flex items-center pl-2">
            {agents.filter(agent => agent.active).map(agent => (
              <AgentAvatar
                key={agent.id}
                agentId={agent.id}
                className="-ml-1.5 size-10 rounded-full border-2 border-washi object-cover"
              />
            ))}
          </div>
          <h2 className="m-0 mb-1.5 font-serif text-xl font-semibold">这间房还没有消息。</h2>
          <p className="m-0 max-w-[46ch] text-sm leading-relaxed text-muted">直接说，在场的人会按顺序接话。输入 @，只问其中一位。</p>
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {events.map(event => <RoomMessage key={event.seq} event={event} />)}
        </ol>
      )}
      {runningAgents.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted" role="status">
          <AgentAvatar agentId={runningAgents[0]!.id} className="size-6 rounded-full object-cover" />
          <span>{runningAgents.map(agent => agent.label).join('、')} 正在思考…</span>
        </div>
      )}
    </section>
  );
}
