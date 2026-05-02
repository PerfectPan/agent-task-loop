import { describe, expect, it, vi } from 'vitest';
import { runAgentCommand } from '../../src/adapters/base';

describe('runAgentCommand', () => {
  it('streams combined output while preserving final stdout/stderr', async () => {
    const onOutput = vi.fn();

    const result = await runAgentCommand(
      process.execPath,
      [
        '-e',
        [
          "process.stdout.write('step-1\\n');",
          "process.stderr.write('warn-1\\n');",
          "process.stdout.write('step-2\\n');",
        ].join(''),
      ],
      {},
      process.cwd(),
      undefined,
      undefined,
      onOutput,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('step-1');
    expect(result.stdout).toContain('step-2');
    expect(result.stderr).toContain('warn-1');
    expect(onOutput).toHaveBeenCalled();
    const output = onOutput.mock.calls.map(call => String(call[0])).join('');
    expect(output).toContain('step-1');
    expect(output).toContain('warn-1');
  });
});
