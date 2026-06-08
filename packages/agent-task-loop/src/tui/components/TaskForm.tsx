import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TARGET_AGENTS, type TargetAgent } from '../../types/task';
import type { CreateTaskPayload } from '../../task-management/task-provider';

export interface TaskFormProps {
  onSubmit: (payload: CreateTaskPayload) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
}

type FieldKey = 'taskId' | 'title' | 'project' | 'targetAgent' | 'priority' | 'description';

const FIELDS: { key: FieldKey; label: string; hint?: string }[] = [
  { key: 'taskId', label: 'Task ID', hint: 'e.g. IDEA-200' },
  { key: 'title', label: 'Title' },
  { key: 'project', label: 'Project' },
  { key: 'targetAgent', label: 'Agent', hint: '←/→ to choose' },
  { key: 'priority', label: 'Priority', hint: '0-9' },
  { key: 'description', label: 'Description' },
];

/** New-task form. Owns its own key handling while mounted. */
export function TaskForm({ onSubmit, onCancel, submitting, error }: TaskFormProps): React.JSX.Element {
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('');
  const [agentIndex, setAgentIndex] = useState(0);
  const [priority, setPriority] = useState('3');
  const [description, setDescription] = useState('');
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);

  const targetAgent = TARGET_AGENTS[agentIndex] as TargetAgent;
  const text: Record<FieldKey, string> = {
    taskId,
    title,
    project,
    targetAgent,
    priority,
    description,
  };
  const setText: Record<FieldKey, (v: string) => void> = {
    taskId: setTaskId,
    title: setTitle,
    project: setProject,
    targetAgent: () => {},
    priority: setPriority,
    description: setDescription,
  };
  const valid = taskId.trim().length > 0 && title.trim().length > 0;

  const submit = () => {
    setTouched(true);
    if (!valid || submitting) return;
    onSubmit({
      taskId: taskId.trim(),
      title: title.trim(),
      project: project.trim(),
      targetAgent,
      priority: Number(priority) || 0,
      description: description.trim() || undefined,
    });
  };

  useInput((input, key) => {
    if (key.escape) return onCancel();
    const field = FIELDS[index].key;

    if (key.return) return submit();
    if (key.tab && key.shift) return setIndex(i => (i - 1 + FIELDS.length) % FIELDS.length);
    if (key.tab || key.downArrow) return setIndex(i => (i + 1) % FIELDS.length);
    if (key.upArrow) return setIndex(i => (i - 1 + FIELDS.length) % FIELDS.length);

    if (field === 'targetAgent') {
      if (key.rightArrow || input === ' ') setAgentIndex(i => (i + 1) % TARGET_AGENTS.length);
      else if (key.leftArrow) setAgentIndex(i => (i - 1 + TARGET_AGENTS.length) % TARGET_AGENTS.length);
      return;
    }
    if (key.backspace || key.delete) return setText[field](text[field].slice(0, -1));
    if (field === 'priority') {
      if (/^[0-9]$/.test(input)) setText[field](input);
      return;
    }
    if (input && !key.ctrl && !key.meta) setText[field](text[field] + input);
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} flexGrow={1} overflow="hidden">
      <Text bold color="cyan">
        New task
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {FIELDS.map((f, i) => {
          const active = i === index;
          const value = f.key === 'targetAgent' ? `◀ ${targetAgent} ▶` : text[f.key];
          return (
            <Box key={f.key}>
              <Box width={14} flexShrink={0}>
                <Text color={active ? 'cyan' : undefined}>
                  {active ? '❯ ' : '  '}
                  {f.label}
                </Text>
              </Box>
              <Text inverse={active} wrap="truncate-end">
                {value || ' '}
              </Text>
              {active && f.hint ? <Text dimColor>{'  ' + f.hint}</Text> : null}
            </Box>
          );
        })}
      </Box>
      {touched && !valid ? <Text color="red">Task ID and Title are required.</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
      <Box marginTop={1}>
        <Text dimColor>
          {submitting ? 'Creating…' : '[Tab/↑↓] field  [←/→] agent  [Enter] submit  [Esc] cancel'}
        </Text>
      </Box>
    </Box>
  );
}
