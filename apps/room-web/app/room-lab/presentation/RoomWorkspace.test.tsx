// @vitest-environment jsdom
import { copy } from '../copy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
vi.mock('react-router', () => ({
  Link: ({ to, children, prefetch: _prefetch, preventScrollReset: _reset, ...rest }: {
    to: string; children: React.ReactNode; prefetch?: string; preventScrollReset?: boolean;
  }) => <a href={to} {...rest}>{children}</a>,
  useLocation: () => ({ pathname: '/room/r_aaaaaaaaaa' }),
}));
import { RoomWorkspace } from './RoomWorkspace';
import { RoomMessage } from './RoomMessage';
import { roomFixture } from './testing/room-fixture';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Room workspace', () => {
  it('uses Rivus as the product wordmark, not 房间', () => {
    render(<RoomWorkspace state={roomFixture()} pending={false} value=""
      onValueChange={vi.fn()} onAction={vi.fn()} />);
    expect(copy.label.product).not.toBe(copy.label.rooms);
    const brand = screen.getByText(copy.label.product);
    expect(brand.tagName).toBe('STRONG');
  });

  it('does not introduce task controls or the board link this round', () => {
    render(<RoomWorkspace state={roomFixture()} pending={false} value=""
      onValueChange={vi.fn()} onAction={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /任务/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /看板/ })).toBeNull();
    expect(screen.queryByText(/Task/)).toBeNull();
  });

  // The room menu is a Radix DropdownMenu, so 清空对话 is a `menuitem` and the
  // trigger opens on pointerdown, not click. The contract under test is
  // unchanged: the destructive step is still two clicks inside the menu, and
  // 取消 still puts it back.
  const openRoomMenu = () =>
    fireEvent.pointerDown(screen.getByLabelText('房间菜单'), { button: 0, ctrlKey: false });

  it('only clears the conversation after an inline second step', () => {
    const onAction = vi.fn();
    render(<RoomWorkspace state={roomFixture()} pending={false} value=""
      onValueChange={vi.fn()} onAction={onAction} />);
    openRoomMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '清空对话' }));
    expect(onAction).not.toHaveBeenCalledWith({ action: 'reset' });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('button', { name: '确认清空' })).toBeNull();
    openRoomMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '清空对话' }));
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }));
    expect(onAction).toHaveBeenCalledWith({ action: 'reset' });
  });

  it('runs count-off from the context column and keeps its record there', () => {
    const onAction = vi.fn();
    const state = roomFixture({
      countOff: { runId: 'COUNT-001', status: 'completed', nextNumber: 6, total: 5,
        agentIds: roomFixture().activeAgentIds, reports: [] },
    });
    render(<RoomWorkspace state={state} pending={false} value=""
      onValueChange={vi.fn()} onAction={onAction} />);
    const aside = screen.getByRole('complementary', { name: '成员与连接' });
    fireEvent.click(within(aside).getByRole('button', { name: '开始报数' }));
    expect(onAction).toHaveBeenCalledWith({ action: 'count-off' });
    expect(within(aside).getByText('5 位全部通过')).toBeTruthy();
  });

  it('keeps a held draft out of the transcript and retries it from where the member is listed', () => {
    const state = roomFixture({ events: [{
      seq: 4, messageId: 'web:4', author: { kind: 'human', id: 'director' }, kind: 'human',
      body: '大家看看', addressedTo: [], at: '2026-09-17T00:00:00Z',
    }] });
    state.agents = state.agents.map(agent => agent.id === 'relay'
      ? { ...agent, status: 'held', seenSeq: 3, heldUpToSeq: 4, lastDraft: 'PRIVATE_DRAFT' }
      : { ...agent, status: 'posted', seenSeq: 4 });
    const onAction = vi.fn();
    render(<RoomWorkspace state={state} pending={false} value=""
      onValueChange={vi.fn()} onAction={onAction} />);
    expect(screen.getByRole('region', { name: '房间对话' }).textContent).not.toContain('PRIVATE_DRAFT');
    expect(screen.getByRole('region', { name: '房间对话' }).textContent).toContain('草稿被新消息打断');
    const aside = screen.getByRole('complementary', { name: '成员与连接' });
    expect(within(aside).getByText('PRIVATE_DRAFT')).toBeTruthy();
    fireEvent.click(within(aside).getByRole('button', { name: '读取更新并重答' }));
    expect(onAction).toHaveBeenCalledWith({ action: 'retry', agentId: 'relay' });
  });

  it('tells the reader whose turn it is and whom a new message would wait behind', () => {
    const state = roomFixture({
      events: [{
        seq: 2, messageId: 'web:2', author: { kind: 'human', id: 'director' }, kind: 'human',
        body: '开始', addressedTo: [], at: '2026-09-17T00:00:00Z',
      }],
      runningAgentIds: ['codex'],
    });
    state.agents = state.agents.map(agent => {
      if (agent.id === 'relay' || agent.id === 'claude') return { ...agent, status: 'posted', seenSeq: 2 };
      if (agent.id === 'codex') return { ...agent, status: 'running', seenSeq: 2 };
      return { ...agent, seenSeq: 0 };
    });
    render(<RoomWorkspace state={state} pending={false} value=""
      onValueChange={vi.fn()} onAction={vi.fn()} />);
    expect(screen.getByText('当前 codex · 待回复 2 位')).toBeTruthy();
    expect(screen.getByText(/排在/).textContent).toContain('dsh');
    expect(screen.queryByRole('button', { name: /停/ })).toBeNull();
    // The composer is a Tiptap editor now, so "still editable" reads off
    // contenteditable rather than a textarea's disabled flag.
    expect(screen.getByRole('textbox').getAttribute('contenteditable')).toBe('true');
  });

  it('renders message bodies as text, not executable HTML, and names the person 你', () => {
    const { container } = render(<ol><RoomMessage event={{
      seq: 1, messageId: 'web:1', author: { kind: 'human', id: 'director' }, kind: 'human',
      body: '<img src=x onerror=alert(1)> @codex', addressedTo: ['codex'], at: '2026-09-05T06:32:00Z',
    }} /></ol>);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(copy.label.human).toBe('你');
    expect(screen.getByText(copy.label.human)).toBeTruthy();
  });
});
