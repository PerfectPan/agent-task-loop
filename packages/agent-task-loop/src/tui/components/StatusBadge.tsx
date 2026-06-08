import React from 'react';
import { Text } from 'ink';
import type { TaskStatus } from '../../types/task';
import { isLiveStatus, statusConfig } from '../logic/status';
import { Spinner } from './Spinner';

export interface StatusBadgeProps {
  /** Task status to render. */
  status: TaskStatus;
  /** When true (default) append a space + the zh label after the glyph. */
  showLabel?: boolean;
}

/**
 * Single-cell status indicator. Renders the status glyph in its configured
 * color, swapping in an animated {@link Spinner} for live statuses. When
 * {@link StatusBadgeProps.showLabel} is true (the default) the Chinese label
 * follows the glyph; pass `false` for a glyph-only narrow badge.
 */
export function StatusBadge({ status, showLabel = true }: StatusBadgeProps): React.JSX.Element {
  const config = statusConfig(status);
  const live = isLiveStatus(status);

  return (
    <Text>
      {live ? <Spinner color={config.color} /> : <Text color={config.color}>{config.glyph}</Text>}
      {showLabel ? <Text color={config.color}>{` ${config.label}`}</Text> : null}
    </Text>
  );
}
