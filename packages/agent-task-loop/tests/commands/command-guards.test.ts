import { defineCommand, runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCommandGuards } from '../../src/commands/command-guards';

const runSpy = vi.fn();

const command = withCommandGuards(
  defineCommand({
    args: {
      task: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
    run: runSpy,
  }),
);

describe('withCommandGuards', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    runSpy.mockReset();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names an unexpected argument without the boolean hint when it is not true or false', async () => {
    await expect(runCommand(command, { rawArgs: ['--task', 'TASK-1', 'extra'] })).rejects.toThrow('exit');

    expect(errorSpy).toHaveBeenCalledWith('Unexpected argument: extra');
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('adds the boolean hint when the unexpected argument is true or false', async () => {
    await expect(runCommand(command, { rawArgs: ['--force', 'false'] })).rejects.toThrow('exit');

    expect(errorSpy).toHaveBeenCalledWith(
      'Unexpected argument: false. Boolean flags take no value; turn one off with --no-<flag> or --<flag>=false.',
    );
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('prints the message of each error in the cause chain', async () => {
    runSpy.mockRejectedValue(new Error('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND api.github.com') }));

    await expect(runCommand(command, { rawArgs: ['--task', 'TASK-1'] })).rejects.toThrow('exit');

    expect(errorSpy).toHaveBeenCalledWith('fetch failed\n  caused by: getaddrinfo ENOTFOUND api.github.com');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
