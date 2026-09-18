import readline from 'node:readline';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createTaskSpy = vi.fn();
const loadConfigMock = vi.fn();
const taskServiceCtor = vi.fn();

vi.mock('../../src/config/load-config', () => ({
  loadConfig: loadConfigMock,
}));

vi.mock('../../src/services/task-service', () => ({
  TaskService: taskServiceCtor.mockImplementation(() => ({
    createTask: createTaskSpy,
  })),
}));

const config = {
  feishu: { baseToken: 'base', tableId: 'table' },
  githubIssues: {
    defaultAgent: 'codex',
    repositories: [{ owner: 'o', repo: 'r', defaultAgent: 'codex' }],
  },
  projects: {},
  repositories: {},
  agents: {},
};

const originalStdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const originalStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

function setTty(stdin: boolean, stdout = stdin): void {
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: stdin });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: stdout });
}

function restoreTty(): void {
  if (originalStdinIsTTY) {
    Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTTY);
  }
  if (originalStdoutIsTTY) {
    Object.defineProperty(process.stdout, 'isTTY', originalStdoutIsTTY);
  }
}

function mockExit(): void {
  vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('exit');
  }) as never);
}

describe('createCommand', () => {
  beforeEach(() => {
    setTty(false);
    createTaskSpy.mockReset();
    createTaskSpy.mockResolvedValue(undefined);
    loadConfigMock.mockReset();
    loadConfigMock.mockResolvedValue(config);
    taskServiceCtor.mockReset();
    taskServiceCtor.mockImplementation(() => ({
      createTask: createTaskSpy,
    }));
  });

  afterEach(() => {
    restoreTty();
    vi.restoreAllMocks();
  });

  it('fails fast with missing flags when stdin is not a TTY', async () => {
    const { createCommand } = await import('../../src/commands/create');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExit();

    await expect(
      createCommand.run?.({
        args: {
          task: 'TASK-101',
          title: 'Scriptable task',
        },
      } as never),
    ).rejects.toThrow('exit');

    expect(err.mock.calls.map(call => String(call[0])).join('\n')).toContain(
      'Missing required flag(s): --project, --agent, --priority',
    );
    expect(createTaskSpy).not.toHaveBeenCalled();
  });

  it('validates the agent flag', async () => {
    const { createCommand } = await import('../../src/commands/create');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExit();

    await expect(
      createCommand.run?.({
        args: {
          task: 'TASK-101',
          title: 'Scriptable task',
          project: 'demo',
          agent: 'bard',
          priority: '3',
        },
      } as never),
    ).rejects.toThrow('exit');

    expect(err.mock.calls.map(call => String(call[0])).join('\n')).toContain(
      'Invalid --agent: Invalid enum value',
    );
    expect(createTaskSpy).not.toHaveBeenCalled();
  });

  it('validates the priority flag', async () => {
    const { createCommand } = await import('../../src/commands/create');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExit();

    await expect(
      createCommand.run?.({
        args: {
          task: 'TASK-101',
          title: 'Scriptable task',
          project: 'demo',
          agent: 'codex',
          priority: '10',
        },
      } as never),
    ).rejects.toThrow('exit');

    expect(err.mock.calls.map(call => String(call[0])).join('\n')).toContain(
      'Invalid --priority: Number must be less than or equal to 9',
    );
    expect(createTaskSpy).not.toHaveBeenCalled();
  });

  it('prompts for missing flags when stdin is a TTY even if stdout is piped', async () => {
    setTty(true, false);
    const { createCommand } = await import('../../src/commands/create');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const answers = ['TASK-201', 'Prompted task', 'web', 'glm', '7'];
    vi.spyOn(readline, 'createInterface').mockReturnValue({
      question: vi.fn((_prompt: string, resolve: (answer: string) => void) => {
        resolve(answers.shift() ?? '');
      }),
      close: vi.fn(),
    } as unknown as readline.Interface);

    await createCommand.run?.({
      args: {},
    } as never);

    expect(createTaskSpy).toHaveBeenCalledWith({
      taskId: 'TASK-201',
      title: 'Prompted task',
      project: 'web',
      targetAgent: 'glm',
      priority: 7,
    });
    expect(log).toHaveBeenCalledWith('Created task TASK-201 in feishu');
  });

  it('creates a task and prints a one-line confirmation', async () => {
    const { createCommand } = await import('../../src/commands/create');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createCommand.run?.({
      args: {
        task: 'TASK-101',
        title: 'Scriptable task',
        project: 'demo',
        agent: 'codex',
        priority: '4',
        description: 'Create this from CI',
        source: 'github:o/r',
        config: 'cfg.json',
      },
    } as never);

    expect(loadConfigMock).toHaveBeenCalledWith('cfg.json');
    expect(taskServiceCtor).toHaveBeenCalledWith(config);
    expect(createTaskSpy).toHaveBeenCalledWith({
      taskId: 'TASK-101',
      title: 'Scriptable task',
      project: 'demo',
      targetAgent: 'codex',
      priority: 4,
      description: 'Create this from CI',
      source: 'github:o/r',
    });
    expect(log).toHaveBeenCalledWith('Created task TASK-101 in github:o/r');
  });

  it('prints created task id and default source as json', async () => {
    const { createCommand } = await import('../../src/commands/create');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await createCommand.run?.({
      args: {
        task: 'TASK-102',
        title: 'Default source task',
        project: 'demo',
        agent: 'claude',
        priority: 0,
        json: true,
      },
    } as never);

    const payload = createTaskSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('source');
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      taskId: 'TASK-102',
      source: 'feishu',
    });
  });

  it('uses the default source without prompting when source is omitted in a TTY json run', async () => {
    setTty(true);
    const { createCommand } = await import('../../src/commands/create');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const createInterface = vi.spyOn(readline, 'createInterface').mockReturnValue({
      question: vi.fn((_prompt: string, resolve: (answer: string) => void) => {
        resolve('');
      }),
      close: vi.fn(),
    } as unknown as readline.Interface);

    await createCommand.run?.({
      args: {
        task: 'TASK-103',
        title: 'TTY json task',
        project: 'demo',
        agent: 'codex',
        priority: '5',
        json: true,
      },
    } as never);

    expect(createInterface).not.toHaveBeenCalled();
    expect(createTaskSpy).toHaveBeenCalledWith({
      taskId: 'TASK-103',
      title: 'TTY json task',
      project: 'demo',
      targetAgent: 'codex',
      priority: 5,
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      taskId: 'TASK-103',
      source: 'feishu',
    });
  });
});
