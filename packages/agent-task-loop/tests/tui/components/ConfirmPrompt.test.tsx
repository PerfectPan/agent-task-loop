import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmPrompt } from '../../../src/tui/components/ConfirmPrompt';
import { stripAnsi } from '../helpers';

/** Let ink's useInput effect subscribe to stdin before writing. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('ConfirmPrompt', () => {
  it('renders the message followed by the (y/n) hint', () => {
    const { lastFrame } = render(
      <ConfirmPrompt message="Delete task?" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(stripAnsi(lastFrame() ?? '')).toContain('Delete task? (y/n)');
  });

  it('calls onConfirm when "y" is pressed', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(
      <ConfirmPrompt message="ok?" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    await tick();
    stdin.write('y');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onConfirm when uppercase "Y" is pressed', async () => {
    const onConfirm = vi.fn();
    const { stdin } = render(
      <ConfirmPrompt message="ok?" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    await tick();
    stdin.write('Y');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when "n" is pressed', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(
      <ConfirmPrompt message="ok?" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    await tick();
    stdin.write('n');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when uppercase "N" is pressed', async () => {
    const onCancel = vi.fn();
    const { stdin } = render(
      <ConfirmPrompt message="ok?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    await tick();
    stdin.write('N');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape is pressed', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { stdin } = render(
      <ConfirmPrompt message="ok?" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    await tick();
    stdin.write('\x1B');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
