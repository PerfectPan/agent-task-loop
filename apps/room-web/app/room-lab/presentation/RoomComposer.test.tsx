// @vitest-environment jsdom
import { useState, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomComposer } from './RoomComposer';

afterEach(cleanup);
type Props = ComponentProps<typeof RoomComposer>;
function Harness(props: Partial<Props> & { onSubmit: () => void }) {
  const [value, setValue] = useState(props.value ?? '');
  return <RoomComposer mode="room" disabled={false} activeAgentIds={['claude', 'codex']}
    taskGateReady onModeChange={() => {}} {...props} value={value} onValueChange={setValue} />;
}

describe('Room composer', () => {
  it('sends once on Enter and keeps Shift+Enter for a newline', () => {
    const send = vi.fn();
    render(<Harness value="一起讨论" onSubmit={send} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not send or complete a mention while confirming Chinese IME input', () => {
    const send = vi.fn();
    render(<Harness value="中文" onSubmit={send} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(send).not.toHaveBeenCalled();
  });

  it('selects a mention on Enter without sending the message', () => {
    const send = vi.fn();
    render(<Harness onSubmit={send} />);
    const input = screen.getByRole('combobox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '@co', selectionStart: 3 } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('@codex ');
    expect(send).not.toHaveBeenCalled();
  });

  it('opens the mention menu from the toolbar and only lists active members', () => {
    render(<Harness onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '提及' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.queryByRole('option', { name: /dsh/i })).toBeNull();
  });

  it('blocks empty, busy, and unconfigured task submissions', () => {
    const send = vi.fn();
    const view = render(<Harness onSubmit={send} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    view.unmount();
    render(<Harness value="任务" mode="task" taskGateReady={false} onSubmit={send} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /开始任务/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a disabled draft intact', () => {
    const send = vi.fn();
    render(<Harness value="保留草稿" disabled onSubmit={send} />);
    fireEvent.submit(screen.getByRole('button', { name: /运行中/ }).closest('form')!);
    expect(send).not.toHaveBeenCalled();
    expect((screen.getByRole('combobox') as HTMLTextAreaElement).value).toBe('保留草稿');
  });
});
