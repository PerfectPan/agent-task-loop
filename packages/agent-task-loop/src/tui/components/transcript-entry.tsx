import React from 'react';
import { Box, Text } from 'ink';

// role 取自逐行解析的转录文本，可能不在表内，读取按可缺失处理。
const ROLE_STYLE: Record<string, { color: string; icon: string } | undefined> = {
  user: { color: 'cyan', icon: '▌' },
  assistant: { color: 'green', icon: '▌' },
  reasoning: { color: 'magenta', icon: '·' },
};

/** Render one parsed transcript line as a chat-style block (role header + body). */
export function TranscriptEntry({ line }: { line: string }): React.JSX.Element {
  if (line.startsWith('⚙')) {
    return (
      <Box marginBottom={1}>
        <Text color="yellow" wrap="truncate-end">
          {line}
        </Text>
      </Box>
    );
  }
  const sep = line.indexOf(': ');
  const role = sep > 0 ? line.slice(0, sep) : '';
  const style = ROLE_STYLE[role];
  if (!style) {
    return (
      <Box marginBottom={1}>
        <Text wrap="wrap">{line}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={style.color} bold>
        {style.icon} {role}
      </Text>
      <Text wrap="wrap">{line.slice(sep + 2)}</Text>
    </Box>
  );
}
