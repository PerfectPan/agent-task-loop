import { Text, useInput } from 'ink';

export interface ConfirmPromptProps {
  /** Question to show the user before the (y/n) hint. */
  message: string;
  /** Invoked when the user confirms ('y'/'Y'). */
  onConfirm: () => void;
  /** Invoked when the user declines ('n'/'N') or hits Escape. */
  onCancel: () => void;
}

/**
 * A minimal yes/no confirmation line. Renders `message + ' (y/n)'` and resolves
 * via keyboard: 'y'/'Y' confirms, 'n'/'N' or Escape cancels.
 */
export function ConfirmPrompt({ message, onConfirm, onCancel }: ConfirmPromptProps) {
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (input === 'y' || input === 'Y') {
      onConfirm();
      return;
    }
    if (input === 'n' || input === 'N') {
      onCancel();
    }
  });

  return <Text>{`${message} (y/n)`}</Text>;
}
