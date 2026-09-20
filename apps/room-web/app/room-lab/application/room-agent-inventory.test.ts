import { describe, expect, it } from 'vitest';
import type { AgentDefinition } from '../domain/agent-registry';
import {
  commandWord,
  listRoomAgentInventory,
  readWhence,
} from './room-agent-inventory.server';

const AGENTS: AgentDefinition[] = [
  { id: 'codex', label: 'Codex', role: '实施', command: 'codex exec --color never', color: 3, position: 0, systemPrompt: '' },
  { id: 'opencode', label: 'OpenCode', role: '搭建', command: 'NO_COLOR=1 opencode run --pure', color: 4, position: 1, systemPrompt: '' },
  { id: 'relay', label: 'relay', role: '成员', command: 'relay -p --output-format text', color: 1, position: 2, systemPrompt: '' },
  { id: 'dsh', label: 'DSH', role: '分析', command: 'dsh --profile headless', color: 5, position: 3, systemPrompt: '' },
];

describe('room agent inventory', () => {
  it('asks one shell about every member and shows the row each answer came from', () => {
    const calls: string[][] = [];
    const answers: Record<string, string> = {
      codex: 'codex: command',
      opencode: 'opencode: command',
      relay: 'relay: alias',
      dsh: 'dsh: none',
    };
    const inventory = listRoomAgentInventory(AGENTS, words => {
      calls.push([...words]);
      return words.map(word => answers[word] ?? `${word}: none`).join('\n');
    });

    // One interactive login shell for the whole desk, and the `KEY=value`
    // prefix is not the executable.
    expect(calls).toEqual([['codex', 'opencode', 'relay', 'dsh']]);
    expect(inventory).toEqual([
      { id: 'codex', label: 'Codex', role: '实施', color: 3, availability: 'runnable', command: 'codex exec --color never' },
      { id: 'opencode', label: 'OpenCode', role: '搭建', color: 4, availability: 'runnable', command: 'NO_COLOR=1 opencode run --pure' },
      { id: 'relay', label: 'relay', role: '成员', color: 1, availability: 'runnable', command: 'relay -p --output-format text' },
      { id: 'dsh', label: 'DSH', role: '分析', color: 5, availability: 'missing', command: 'dsh --profile headless' },
    ]);
  });

  it('reads whence kinds without expanding what an alias stands for', () => {
    expect(readWhence('claude: command\n', 'claude')).toBe('runnable');
    expect(readWhence('relay: alias\n', 'relay')).toBe('runnable');
    expect(readWhence('helper: function\n', 'helper')).toBe('runnable');
    expect(readWhence('cd: builtin\n', 'cd')).toBe('runnable');
    expect(readWhence('nothing: none\n', 'nothing')).toBe('missing');
    expect(readWhence('', 'nothing')).toBe('missing');
    // An answer about some other word is not an answer about this one.
    expect(readWhence('other: command\n', 'nothing')).toBe('missing');
  });

  it('finds the executable past environment assignments', () => {
    expect(commandWord('NO_COLOR=1 LANG=C opencode run')).toBe('opencode');
    expect(commandWord('  dsh --profile headless ')).toBe('dsh');
    expect(commandWord('')).toBeUndefined();
  });
});
