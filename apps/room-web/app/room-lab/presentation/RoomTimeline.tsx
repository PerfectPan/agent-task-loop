import type { RoomLabEventView } from '../read-model';
import styles from './RoomLab.module.css';

export function RoomTimeline({ events, head }: { events: RoomLabEventView[]; head: number }) {
  return (
    <section className={styles.timelinePanel} aria-label="Shared Room event stream">
      <div className={styles.timelineHeading}>
        <span className={styles.eyebrow}>AUTHORITATIVE WORLD</span>
        <h2>Room event stream</h2>
        <p>只有这里出现的正文，才算对两个 Agent 都成立的公开事实。</p>
        <span className={styles.srOnly} role="status" aria-live="polite">
          Room head is now sequence {head}; {events.length} events are visible.
        </span>
      </div>

      {events.length === 0 ? (
        <div className={styles.emptyTimeline}>
          <span>SEQ 000</span>
          <strong>等待第一条消息进入共享世界</strong>
          <p>自由聊天会并发唤醒两端；Task 模式会依次开放实施席和审核席。</p>
        </div>
      ) : (
        <ol className={styles.timeline}>
          {events.map(event => (
            <li key={event.seq} className={styles.timelineEvent}>
              <div className={styles.seqMarker}>{String(event.seq).padStart(3, '0')}</div>
              <article className={`${styles.eventCard} ${styles[`event_${event.author.kind}`]}`}>
                <header>
                  <strong>{event.author.id}</strong>
                  <span>{event.kind}</span>
                  <time dateTime={event.at}>
                    {new Date(event.at).toLocaleTimeString('zh-CN', {
                      hour12: false,
                      timeZone: 'Asia/Shanghai',
                    })}
                  </time>
                </header>
                <p>{event.body}</p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
