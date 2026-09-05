// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomWorkspace } from './RoomWorkspace';
import { RoomMessage } from './RoomMessage';
import { TaskStrip } from './TaskStrip';
import { roomFixture } from './testing/room-fixture';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Room workspace', () => {
  it('starts a task through the existing task action and only clears by confirmation', () => {
    const onAction = vi.fn();
    render(<RoomWorkspace state={roomFixture()} pending={false} value="验收要求"
      onValueChange={vi.fn()} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }));
    fireEvent.click(screen.getByRole('button', { name: /开始任务/ }));
    expect(onAction).toHaveBeenCalledWith({ action: 'task', title: '验收要求' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByLabelText('房间菜单'));
    fireEvent.click(screen.getByRole('button', { name: '清空对话' }));
    expect(confirm).toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalledWith({ action: 'reset' });
  });

  it('runs count-off and keeps its proof visible in details', () => {
    const onAction = vi.fn();
    render(<RoomWorkspace state={roomFixture()} pending={false} value=""
      onValueChange={vi.fn()} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '检查连接' }));
    expect(onAction).toHaveBeenCalledWith({ action: 'count-off' });
    expect(screen.getByRole('dialog', { name: '运行详情' })).toBeTruthy();
    expect(screen.getAllByText('尚未验证').length).toBeGreaterThan(0);
  });

  it('does not expose held drafts in the public transcript', () => {
    const state = roomFixture();
    state.agents[0] = { ...state.agents[0]!, status: 'held', heldUpToSeq: 4, lastDraft: 'PRIVATE_DRAFT' };
    const onAction = vi.fn();
    render(<RoomWorkspace state={state} pending={false} value=""
      onValueChange={vi.fn()} onAction={onAction} />);
    expect(screen.getByRole('region', { name: '房间对话' }).textContent).not.toContain('PRIVATE_DRAFT');
    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    expect(screen.getByText('未进入对话的草稿')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '读取更新并重答' }));
    expect(onAction).toHaveBeenCalledWith({ action: 'retry', agentId: 'claude-relay' });
  });

  it('renders message bodies as text, not executable HTML', () => {
    const { container } = render(<ol><RoomMessage event={{
      seq: 1, author: { kind: 'human', id: 'director' }, kind: 'human',
      body: '<img src=x onerror=alert(1)> @codex', addressedTo: ['codex'], at: '2026-09-05T06:32:00Z',
    }} /></ol>);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(screen.getByText('董事长')).toBeTruthy();
  });

  it('does not conflate model review with human approval', () => {
    render(<TaskStrip task={{ taskId: 'task-1', title: '实现目标', status: 'passed',
      round: 1, maxRounds: 2, allowedSeat: 'review', occupied: false, verdict: 'PASS' }} />);
    expect(screen.getByText('模型审核通过，待人工验收')).toBeTruthy();
  });
});
