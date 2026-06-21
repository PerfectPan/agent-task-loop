import React from 'react';
import { Box, Text } from 'ink';
import type { Pane } from '../types';

export interface StatusBarProps {
  /** Which pane currently holds keyboard focus. */
  focusedPane: Pane;
  /** True while the user is typing a filter query. */
  filtering: boolean;
  /** Whether the new-task action (n) is available; adds an `[n] new` hint. */
  canCreate?: boolean;
  /** Whether the source filter (s) is available; adds an `[s] source` hint. */
  canFilterSource?: boolean;
}

/** Keybinding hints shown while the filter input is active. */
const FILTER_HINTS = '[Esc] cancel  [Enter] apply  type to filter';

/** Hints shared across every (non-filtering) pane. `n` is global, so it sits here. */
function commonHints(canCreate: boolean): string[] {
  return [...(canCreate ? ['[n] new'] : []), '[?] help', '[q] quit'];
}

/** Build the per-pane keybinding hints (filter mode handled by caller). */
function hintsFor(focusedPane: Pane, canCreate: boolean, canFilterSource: boolean): string {
  const common = commonHints(canCreate);
  switch (focusedPane) {
    case 'list':
      return [
        '[↑↓/jk] nav',
        '[Tab] focus',
        '[Enter] attach',
        '[/] filter',
        ...(canFilterSource ? ['[s] source'] : []),
        '[d] stop',
        ...common,
      ].join('  ');
    case 'detail':
      return ['[↑↓/jk] scroll', '[Tab] focus', '[Enter] attach', ...common].join('  ');
    case 'preview':
      return ['[↑↓/jk] scroll', '[Tab] focus', '[m] mode', ...common].join('  ');
  }
}

/**
 * Single footer line of context-relevant keybinding hints. Pure presentation:
 * the hint set is derived solely from focus + filter state passed in via props.
 */
export function StatusBar({
  focusedPane,
  filtering,
  canCreate = false,
  canFilterSource = false,
}: StatusBarProps): React.ReactElement {
  const hints = filtering ? FILTER_HINTS : hintsFor(focusedPane, canCreate, canFilterSource);
  return (
    <Box>
      <Text dimColor>{hints}</Text>
    </Box>
  );
}
