import React from 'react';
import { Box, Text } from 'ink';

interface HelpOverlayProps {
  /** Whether the overlay is shown; when false the component renders nothing. */
  visible: boolean;
}

interface Binding {
  keys: string;
  action: string;
}

const BINDINGS: readonly Binding[] = [
  { keys: '↑/↓ or j/k', action: 'nav' },
  { keys: 'Tab', action: 'cycle pane' },
  { keys: 'm', action: 'cycle preview mode' },
  { keys: 'Enter', action: 'attach' },
  { keys: 'r', action: 'refresh' },
  { keys: '/', action: 'filter' },
  { keys: '1/2/3/4', action: 'tabs' },
  { keys: 'p', action: 'toggle preview' },
  { keys: 'd', action: 'stop (confirm)' },
  { keys: 'g/G', action: 'first/last' },
  { keys: 'w', action: 'workflow diagram' },
  { keys: '?', action: 'help' },
  { keys: 'q', action: 'quit' },
];

/**
 * Modal-style overlay listing the dashboard keyboard shortcuts.
 * Returns `null` when `visible` is false.
 */
export function HelpOverlay({ visible }: HelpOverlayProps): React.ReactElement | null {
  if (!visible) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        Keyboard Shortcuts
      </Text>
      {BINDINGS.map(binding => (
        <Box key={binding.keys}>
          <Box width={12}>
            <Text color="yellow">{binding.keys}</Text>
          </Box>
          <Text>{binding.action}</Text>
        </Box>
      ))}
    </Box>
  );
}
