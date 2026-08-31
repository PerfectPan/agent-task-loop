import { useEffect, useRef, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { RoomLabStateSelector } from '../read-model';
import type {
  RoomLabAction,
  RoomLabActionResponse,
  RoomLabState,
} from '../read-model';
import { CrewComposer } from './CrewComposer';
import { RoomComposer } from './RoomComposer';
import { RoomInspector } from './RoomInspector';
import { RoomTimeline } from './RoomTimeline';
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
  }, [fetcher.data, revalidator, state.epoch]);

  const pending = fetcher.state !== 'idle';
  useEffect(() => {
    if (!pending) return;
    const poll = window.setInterval(() => {
      if (revalidator.state === 'idle') revalidator.revalidate();
    }, 900);
    return () => window.clearInterval(poll);
  }, [pending, revalidator]);

  const taskGateReady = state.activeAgentIds.includes('codex') &&
    state.activeAgentIds.includes('claude');
  const agentsById = new Map(state.agents.map(agent => [agent.id, agent]));
  const activeAgents = state.activeAgentIds
    .map(agentId => agentsById.get(agentId))
    .filter(agent => agent !== undefined);
  useEffect(() => {
    if (!taskGateReady) setMode('room');
  }, [taskGateReady]);

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
      : 'LOCAL ONLY · READY';

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a
          className={styles.brand}
          href="https://github.com/PerfectPan/agent-task-loop"
          aria-label="Open Rivus on GitHub"
          target="_blank"
          rel="noreferrer"
        >
          <strong>RIVUS ROOM</strong>
          <span>Shared local agent workspace</span>
        </a>
        <div className={styles.topbarReadout}>
          <span>Room</span>
          <strong>{state.roomId}</strong>
        </div>
        <div className={styles.topStatus} role="status" aria-live="polite">
          <span className={error ? styles.errorDot : disabled ? styles.busyDot : styles.readyDot} />
          {statusText}
        </div>
      </header>

      <section className={styles.workspace}>
        <CrewComposer
          agents={state.agents}
          activeAgentIds={state.activeAgentIds}
          disabled={disabled}
          onCompose={agentIds => runAction({ action: 'compose', agentIds })}
        />

        <section className={styles.conversationWorkspace} aria-labelledby="room-heading">
          <header className={styles.conversationHeader}>
            <div>
              <span className={styles.kicker}>SHARED CONVERSATION</span>
              <h1 id="room-heading">One room, {state.activeAgentIds.length} active voice{state.activeAgentIds.length === 1 ? '' : 's'}.</h1>
              <p>Every visible message is an admitted fact. Drafts stay private until Room accepts them.</p>
              <ol className={styles.conversationCrewSummary} aria-label="Active Room order">
                {activeAgents.map((agent, index) => (
                  <li key={agent.id}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    {agent.label}
                  </li>
                ))}
              </ol>
            </div>
            <button
              type="button"
              className={styles.countOffButton}
              disabled={disabled}
              onClick={() => runAction({ action: 'count-off' })}
            >
              Run count-off
            </button>
          </header>

          {error && <div className={styles.errorBanner} role="alert">{error}</div>}
          {state.countOff?.status === 'completed' && (
            <div className={styles.successBanner} role="status">
              <strong>Count-off complete</strong>
              <span>{state.countOff.total} agents acknowledged in the configured order.</span>
            </div>
          )}

          <RoomTimeline
            events={state.events}
            head={state.head}
            activeCount={state.activeAgentIds.length}
          />
          <RoomComposer
            mode={mode}
            value={value}
            disabled={disabled}
            activeAgentIds={state.activeAgentIds}
            taskGateReady={taskGateReady}
            onModeChange={setMode}
            onValueChange={setValue}
            onSubmit={submit}
          />
        </section>

        <RoomInspector
          state={state}
          disabled={disabled}
          onRetry={agentId => runAction({ action: 'retry', agentId })}
        />
      </section>

      <footer className={styles.labFooter}>
        <p>
          Room owns ordering, addressing and HELD writes. Task gate owns implementation rounds and independent review.
        </p>
        <button type="button" disabled={disabled} onClick={() => runAction({ action: 'reset' })}>
          Reset conversation
        </button>
      </footer>
    </main>
  );
}
