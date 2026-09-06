import { useEffect, useRef } from 'react';
import type { RoomLabAgentView, RoomLabEventView } from '../read-model';
import { AgentAvatar } from './AgentAvatar';
import { RoomMessage } from './RoomMessage';
import styles from './RoomTimeline.module.css';

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
    <section ref={scrollRef} className={styles.timelinePanel} aria-label="房间对话"
      onScroll={event => {
        const pane = event.currentTarget;
        atBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 100;
      }}>
      <span className={styles.srOnly} role="status" aria-live="polite">已收到 {events.length} 条消息，最新序号 {head}。</span>
      {events.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyCrew}>{agents.filter(agent => agent.active).map(agent =>
            <AgentAvatar key={agent.id} agentId={agent.id} />)}</div>
          <h2>把想法带进房间。</h2>
          <p>聊一个问题，写一份初稿，或一起推敲下一步。</p>
          <small>直接发消息邀请所有成员，输入 @ 点名一位 Agent。</small>
        </div>
      ) : <ol className={styles.messages}>{events.map(event => <RoomMessage key={event.seq} event={event} />)}</ol>}
      {runningAgents.length > 0 && <div className={styles.typing} role="status">
        <AgentAvatar agentId={runningAgents[0]!.id} />
        <span>{runningAgents.map(agent => agent.label).join('、')} 正在思考…</span>
      </div>}
    </section>
  );
}
