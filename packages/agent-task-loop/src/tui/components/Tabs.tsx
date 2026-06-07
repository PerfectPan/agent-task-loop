import React from 'react';
import { Box, Text } from 'ink';
import { TABS, type TabKey } from '../logic/status';

export interface TabsProps {
  /** The currently selected tab. */
  active: TabKey;
  /** Per-tab task counts, shown as a parenthesised suffix on each chip. */
  counts: Record<TabKey, number>;
}

/**
 * Horizontal row of tab chips rendered as `Label(count)`. The active chip is
 * drawn bold with an inverse cyan highlight; inactive chips are dimmed.
 */
export function Tabs({ active, counts }: TabsProps): React.ReactElement {
  return (
    <Box flexDirection="row">
      {TABS.map((tab, index) => {
        const isActive = tab.key === active;
        const chip = `${tab.label}(${counts[tab.key] ?? 0})`;
        return (
          <Box key={tab.key} marginRight={index < TABS.length - 1 ? 1 : 0}>
            <Text
              color={isActive ? 'cyan' : undefined}
              inverse={isActive}
              bold={isActive}
              dimColor={!isActive}
            >
              {` ${chip} `}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
