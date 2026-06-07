import React from 'react';
import { Box, Text } from 'ink';
import type { Pane } from '../types';

export interface StatusBarProps {
  /** Which pane currently holds keyboard focus. */
  focusedPane: Pane;
  /** True while the user is typing a filter query. */
  filtering: boolean;
}

/** Keybinding hints shown while the filter input is active. */
const FILTER_HINTS = '[Esc] cancel  [Enter] apply  type to filter';

/** Hints shared across every (non-filtering) pane. */
const COMMON_HINTS = ['[?] help', '[q] quit'];

/** Build the per-pane keybinding hints (filter mode handled by caller). */
function hintsFor(focusedPane: Pane): string {
  switch (focusedPane) {
    case 'list':
      return [
        '[↑↓/jk] nav',
        '[Tab] focus',
        '[Enter] attach',
        '[/] filter',
        '[d] stop',
        ...COMMON_HINTS,
      ].join('  ');
    case 'detail':
      return ['[↑↓/jk] scroll', '[Tab] focus', '[Enter] attach', ...COMMON_HINTS].join('  ');
    case 'preview':
      return ['[↑↓/jk] scroll', '[Tab] focus', '[m] mode', ...COMMON_HINTS].join('  ');
  }
}

/**
 * Single footer line of context-relevant keybinding hints. Pure presentation:
 * the hint set is derived solely from focus + filter state passed in via props.
 */
export function StatusBar({ focusedPane, filtering }: StatusBarProps): React.ReactElement {
  const hints = filtering ? FILTER_HINTS : hintsFor(focusedPane);
  return (
    <Box>
      <Text dimColor>{hints}</Text>
    </Box>
  );
}
