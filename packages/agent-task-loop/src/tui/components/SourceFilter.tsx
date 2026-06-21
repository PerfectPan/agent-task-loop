import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SourceOption } from '../logic/source';

export interface SourceFilterProps {
  /** Selectable sources with labels and task counts. */
  options: SourceOption[];
  /** Currently-applied selection (empty = all sources shown). */
  selected: string[];
  /** Apply a new selection. An empty array means "all sources". */
  onApply: (selected: string[]) => void;
  onCancel: () => void;
}

/**
 * Multi-select source filter popup. Space toggles the focused source, Enter
 * applies, Esc cancels. Applying with nothing checked clears the filter (all
 * sources). Owns its own key handling while mounted.
 */
export function SourceFilter({ options, selected, onApply, onCancel }: SourceFilterProps): React.JSX.Element {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selected));
  const [index, setIndex] = useState(0);

  const move = (delta: number) => setIndex(i => (i + delta + options.length) % options.length);
  const toggle = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  useInput((input, key) => {
    if (key.escape) {
      return onCancel();
    }
    if (key.return) {
      return onApply(options.filter(o => checked.has(o.id)).map(o => o.id));
    }
    if (key.upArrow || input === 'k') {
      return move(-1);
    }
    if (key.downArrow || input === 'j') {
      return move(1);
    }
    if (input === ' ' && options[index]) {
      return toggle(options[index].id);
    }
    if (input === 'a') {
      // Toggle all on/off.
      setChecked(prev => (prev.size === options.length ? new Set() : new Set(options.map(o => o.id))));
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} flexGrow={1} overflow="hidden">
      <Text bold color="cyan">
        Sources
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, i) => {
          const active = i === index;
          const mark = checked.has(option.id) ? 'x' : ' ';
          return (
            <Box key={option.id}>
              <Text color={active ? 'cyan' : undefined}>
                {active ? '❯ ' : '  '}
                {`[${mark}] `}
              </Text>
              <Box width={20} flexShrink={0}>
                <Text inverse={active} wrap="truncate-end">
                  {option.label}
                </Text>
              </Box>
              <Text dimColor>{`(${option.count})`}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[↑↓/jk] move  [Space] toggle  [a] all  [Enter] apply  [Esc] cancel</Text>
      </Box>
    </Box>
  );
}
