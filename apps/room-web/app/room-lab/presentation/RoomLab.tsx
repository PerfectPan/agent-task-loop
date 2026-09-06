import { useEffect, useRef, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { RoomLabStateSelector } from '../read-model';
import type { RoomLabAction, RoomLabActionResponse, RoomLabState } from '../read-model';
import { RoomWorkspace } from './RoomWorkspace';

export function RoomLab({ initialState }: { initialState: RoomLabState }) {
  const fetcher = useFetcher<RoomLabActionResponse>();
  const revalidator = useRevalidator();
  const [state, setState] = useState(initialState);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const submittedAction = useRef<RoomLabAction>();
  const handledResponse = useRef<RoomLabActionResponse>();
  const stateSelector = useRef(new RoomLabStateSelector());

  useEffect(() => {
    setState(current => stateSelector.current.takeLoader(current, initialState));
  }, [initialState]);

  useEffect(() => {
    const data = fetcher.data;
    // Remix retains the previous response while a new action is pending.
    // Polling changes the revalidator identity; never handle that old response again.
    if (!data || data === handledResponse.current) return;
    handledResponse.current = data;
    if (!data.ok) {
      setError(data.error);
      submittedAction.current = undefined;
      return;
    }
    if (data.state.epoch !== state.epoch) revalidator.revalidate();
    setState(current => stateSelector.current.takeAction(current, data.state));
    if (submittedAction.current?.action === 'message' || submittedAction.current?.action === 'task') setValue('');
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

  const runAction = (action: RoomLabAction) => {
    if (pending || state.busy) return;
    submittedAction.current = action;
    setError(undefined);
    fetcher.submit(action, { method: 'POST', action: '/room', encType: 'application/json' });
  };

  return <RoomWorkspace state={state} pending={pending} error={error}
    value={value} onValueChange={setValue} onAction={runAction} />;
}
