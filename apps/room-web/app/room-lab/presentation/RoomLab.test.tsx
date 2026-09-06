// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { RoomLabActionResponse } from '../read-model';
import { RoomLab } from './RoomLab';
import { roomFixture } from './testing/room-fixture';

const mocks = vi.hoisted(() => ({
  fetcher: { state: 'idle', data: undefined as RoomLabActionResponse | undefined, submit: vi.fn() },
  revalidator: { state: 'idle', revalidate: vi.fn() },
}));
vi.mock('@remix-run/react', () => ({
  useFetcher: () => mocks.fetcher,
  useRevalidator: () => mocks.revalidator,
}));
vi.mock('./RoomWorkspace', () => ({
  RoomWorkspace: ({ value, onValueChange, onAction }: {
    value: string; onValueChange: (value: string) => void; onAction: (action: unknown) => void;
  }) => <><input aria-label="draft" value={value} onChange={e => onValueChange(e.target.value)} />
    <button onClick={() => onAction({ action: 'message', body: value })}>Send</button></>,
}));
afterEach(() => {
  cleanup();
  mocks.fetcher.state = 'idle';
  mocks.fetcher.data = undefined;
  vi.clearAllMocks();
});

it('does not let polling replay an old response and erase the next draft', () => {
  const state = roomFixture();
  const view = render(<RoomLab initialState={state} />);
  fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'first message' } });
  fireEvent.click(screen.getByText('Send'));
  mocks.fetcher.data = { ok: true, state: { ...state, revision: 1 } };
  view.rerender(<RoomLab initialState={state} />);
  expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('');

  fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'second message' } });
  fireEvent.click(screen.getByText('Send'));
  mocks.fetcher.state = 'submitting';
  mocks.revalidator = { state: 'loading', revalidate: vi.fn() };
  view.rerender(<RoomLab initialState={state} />);
  expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('second message');

  mocks.fetcher.state = 'idle';
  mocks.fetcher.data = { ok: false, error: 'message failed' };
  view.rerender(<RoomLab initialState={state} />);
  expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('second message');
});
