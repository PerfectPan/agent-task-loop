// @vitest-environment jsdom
import { copy } from '../copy';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AgentDesk } from './AgentDesk';

vi.mock('react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a>,
  Form: ({ children, ...rest }: { children: React.ReactNode }) => <form {...rest}>{children}</form>,
  useNavigation: () => ({ state: 'idle', formData: undefined }),
}));

it('shows a system-prompt field per selected agent and does not send CLI probes', () => {
  const { container } = render(
    <AgentDesk desk={{
      lastOpenedId: 'r_aaaaaaaaaa',
      agents: [
        {
          id: 'codex',
          label: 'Codex',
          role: '实施',
          color: 3,
          availability: 'runnable',
          command: '/usr/bin/codex',
          systemPrompt: '先给结论。',
          seatedIn: [{ id: 'r_aaaaaaaaaa', title: 'Q3 定价方案' }],
        },
        { id: 'dsh', label: 'DSH', role: '分析', color: 5, availability: 'missing', seatedIn: [], systemPrompt: '' },
      ],
    }} />,
  );
  expect(screen.getByText(copy.label.product)).toBeTruthy();
  expect(screen.getByRole('heading', { name: '智能体' })).toBeTruthy();
  expect(screen.getByLabelText('Codex 的系统提示')).toBeTruthy();
  expect((screen.getByLabelText('Codex 的系统提示') as HTMLTextAreaElement).value).toBe('先给结论。');
  expect(screen.getByRole('button', { name: '保存' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '发送' })).toBeNull();
  expect(container.querySelector('#agent-instruction')).toBeNull();
  expect(container.querySelector('form input[name="intent"][value="instruct"]')).toBeNull();
  // The role word comes off the agent's row, not a table in the source.
  expect(screen.getByText('实施')).toBeTruthy();
  const row = screen.getByRole('option', { name: /Codex/ });
  expect(row.tagName).not.toBe('BUTTON');
  expect(row.closest('button')).toBeNull();
});
