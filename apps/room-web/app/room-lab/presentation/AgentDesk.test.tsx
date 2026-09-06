// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AgentDesk } from './AgentDesk';

vi.mock('@remix-run/react', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a>,
  Form: ({ children, ...rest }: { children: React.ReactNode }) => <form {...rest}>{children}</form>,
}));

it('shows local agent availability and seated rooms', () => {
  render(
    <AgentDesk desk={{
      lastOpenedId: 'r_aaaaaaaaaa',
      agents: [
        { id: 'codex', label: 'Codex', role: 'Implementation lead', availability: 'runnable', command: '/usr/bin/codex', seatedIn: [{ id: 'r_aaaaaaaaaa', title: 'Q3 定价方案' }] },
        { id: 'dsh', label: 'DSH', role: 'DeepSeek analyst', availability: 'missing', seatedIn: [] },
      ],
    }} />,
  );
  expect(screen.getByRole('heading', { name: '智能体管理' })).toBeTruthy();
  expect(screen.getByText('可运行')).toBeTruthy();
  expect(screen.getByText('未安装')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Q3 定价方案' }).getAttribute('href')).toBe('/room/r_aaaaaaaaaa');
  expect(screen.getByRole('link', { name: '回房间' }).getAttribute('href')).toBe('/room/r_aaaaaaaaaa');
});
