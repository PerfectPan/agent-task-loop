import { useEffect, useRef, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { takeNewestRoomState } from '../read-model';
import type {
  RoomLabAction,
  RoomLabActionResponse,
  RoomLabAgentView,
  RoomLabState,
} from '../read-model';
import { AgentPanel } from './AgentPanel';
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

  useEffect(() => {
    setState(current => takeNewestRoomState(current, initialState));
  }, [initialState]);

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (!data.ok) {
      setError(data.error);
      return;
    }
    setState(current => takeNewestRoomState(current, data.state));
    if (submittedAction.current?.action === 'message' || submittedAction.current?.action === 'task') {
      setValue('');
    }
    submittedAction.current = undefined;
  }, [fetcher.data]);

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
          <span className={styles.eyebrow}>CODEX + CLAUDE / ONE SHARED WORLD</span>
          <h1>看见同一个世界，<br />再决定谁该说话。</h1>
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
      />

      {error && <div className={styles.errorBanner} role="alert">{error}</div>}
      {state.task && <TaskStrip task={state.task} />}

      <div className={styles.flightDeck}>
        <AgentPanel
          agent={state.agents.find(agent => agent.id === 'codex') ?? emptyAgent('codex')}
          disabled={disabled}
          onRetry={agent => runAction({ action: 'retry', agentId: agent.id })}
        />
        <AgentPanel
          agent={state.agents.find(agent => agent.id === 'claude') ?? emptyAgent('claude')}
          disabled={disabled}
          onRetry={agent => runAction({ action: 'retry', agentId: agent.id })}
        />
        <RoomTimeline events={state.events} head={state.head} />
      </div>

      <footer className={styles.labFooter}>
        <p>Room owns seq / seen / HELD. Task Delivery owns rounds / seats / review verdict.</p>
        <button type="button" disabled={disabled} onClick={() => runAction({ action: 'reset' })}>
          Reset local world
        </button>
      </footer>
    </main>
  );
}

function emptyAgent(id: 'codex' | 'claude'): RoomLabAgentView {
  return {
    id,
    label: id === 'codex' ? 'Codex' : 'Claude',
    role: id === 'codex' ? 'Implementation lead' : 'Critical reviewer',
    status: 'idle',
    seenSeq: 0,
  };
}
