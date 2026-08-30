import { useEffect, useRef, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { ROOM_AGENT_ROSTER } from '../domain/agent-roster';
import { RoomLabStateSelector } from '../read-model';
import type {
  RoomLabAction,
  RoomLabActionResponse,
  RoomLabAgentView,
  RoomLabState,
} from '../read-model';
import { AgentPanel } from './AgentPanel';
import { CountOffStrip } from './CountOffStrip';
import { RoomComposer } from './RoomComposer';
import { RoomTimeline } from './RoomTimeline';
import { TaskStrip } from './TaskStrip';
import styles from './RoomLab.module.css';

export function RoomLab({ initialState }: { initialState: RoomLabState }) {
  const fetcher = useFetcher<RoomLabActionResponse>();
  const revalidator = useRevalidator();
  const [state, setState] = useState(initialState);
  const [mode, setMode] = useState<'room' | 'task'>('room');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const submittedAction = useRef<RoomLabAction | undefined>(undefined);
  const stateSelector = useRef(new RoomLabStateSelector());

  useEffect(() => {
    setState(current => stateSelector.current.takeLoader(current, initialState));
  }, [initialState]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (!data.ok) {
      setError(data.error);
      return;
    }
    if (data.state.epoch !== state.epoch) revalidator.revalidate();
    setState(current => stateSelector.current.takeAction(current, data.state));
    if (submittedAction.current?.action === 'message' || submittedAction.current?.action === 'task') {
      setValue('');
    }
    submittedAction.current = undefined;
  }, [fetcher.data, state.epoch]);

  const pending = fetcher.state !== 'idle';
  useEffect(() => {
    if (!pending) return;
    const poll = window.setInterval(() => {
      if (revalidator.state === 'idle') revalidator.revalidate();
    }, 900);
    return () => window.clearInterval(poll);
  }, [pending, revalidator]);

  const runAction = (action: RoomLabAction) => {
    submittedAction.current = action;
    setError(undefined);
    fetcher.submit(action, {
      method: 'POST',
      action: '/room',
      encType: 'application/json',
    });
  };

  const submit = () => {
    if (!value.trim()) return;
    runAction(mode === 'room'
      ? { action: 'message', body: value }
      : { action: 'task', title: value });
  };

  const disabled = pending || state.busy;
  const statusText = error
    ? 'LOCAL LINK DEGRADED'
    : disabled
      ? 'AGENTS IN FLIGHT'
      : 'LOCAL LINK READY';
  const agents = ROOM_AGENT_ROSTER.map(agent =>
    state.agents.find(candidate => candidate.id === agent.id) ?? emptyAgent(agent),
  );

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a
          href="https://github.com/PerfectPan/agent-task-loop"
          aria-label="Open Agent Task Loop on GitHub"
          target="_blank"
          rel="noreferrer"
        >
          ◆
        </a>
        <div>
          <span>RIVUS LOCAL CANARY</span>
          <strong>ROOM FLIGHT DECK</strong>
        </div>
        <div className={styles.topStatus} role="status" aria-live="polite">
          <span className={error ? styles.errorDot : disabled ? styles.busyDot : styles.readyDot} />
          {statusText}
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>FIVE LOCAL AGENTS / ONE SHARED WORLD</span>
          <h1>五个声音，<br />只写进一个世界。</h1>
        </div>
        <div className={styles.heroReadout}>
          <span>ROOM</span>
          <strong>{state.roomId}</strong>
          <span>HEAD SEQUENCE</span>
          <strong>{String(state.head).padStart(3, '0')}</strong>
        </div>
      </section>

      <RoomComposer
        mode={mode}
        value={value}
        disabled={disabled}
        onModeChange={setMode}
        onValueChange={setValue}
        onSubmit={submit}
        onCountOff={() => runAction({ action: 'count-off' })}
      />

      {error && <div className={styles.errorBanner} role="alert">{error}</div>}
      {state.countOff && <CountOffStrip run={state.countOff} />}
      {state.task && <TaskStrip task={state.task} />}

      <div className={styles.flightDeck}>
        <div className={styles.agentColumn}>
          {agents.slice(0, 2).map(agent => (
            <AgentPanel
              key={agent.id}
              agent={agent}
              disabled={disabled}
              onRetry={item => runAction({ action: 'retry', agentId: item.id })}
            />
          ))}
        </div>
        <RoomTimeline events={state.events} head={state.head} />
        <div className={styles.agentColumn}>
          {agents.slice(2).map(agent => (
            <AgentPanel
              key={agent.id}
              agent={agent}
              disabled={disabled}
              onRetry={item => runAction({ action: 'retry', agentId: item.id })}
            />
          ))}
        </div>
      </div>

      <footer className={styles.labFooter}>
        <p>Room owns five-seat seq / addressedTo / seen / HELD. Task Delivery owns rounds / seats / review verdict.</p>
        <button type="button" disabled={disabled} onClick={() => runAction({ action: 'reset' })}>
          Reset local world
        </button>
      </footer>
    </main>
  );
}

function emptyAgent(agent: (typeof ROOM_AGENT_ROSTER)[number]): RoomLabAgentView {
  return {
    id: agent.id,
    label: agent.label,
    role: agent.role,
    status: 'idle',
    seenSeq: 0,
  };
}
