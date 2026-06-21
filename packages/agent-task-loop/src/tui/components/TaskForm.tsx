import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TARGET_AGENTS, type TargetAgent } from '../../types/task';
import type { CreateTaskPayload } from '../../task-management/task-provider';

export interface TaskFormProps {
  onSubmit: (payload: CreateTaskPayload) => void;
  onCancel: () => void;
  submitting?: boolean;
  error?: string | null;
  /** Create-capable backends. With >1, a source selector field is shown. */
  sources?: string[];
  /** When provided, Ctrl+R asks the AI to refine the current description. */
  onRefineDescription?: (input: { title: string; description: string }) => Promise<string>;
}

type FieldKey = 'taskId' | 'title' | 'project' | 'targetAgent' | 'priority' | 'description' | 'source';

/** New-task form. Owns its own key handling while mounted. */
export function TaskForm({ onSubmit, onCancel, submitting, error, sources, onRefineDescription }: TaskFormProps): React.JSX.Element {
  const sourceOptions = sources ?? [];
  const showSource = sourceOptions.length > 1;

  const fields: { key: FieldKey; label: string; hint?: string }[] = [
    { key: 'taskId', label: 'Task ID', hint: 'e.g. IDEA-200' },
    { key: 'title', label: 'Title' },
    ...(showSource ? [{ key: 'source' as const, label: 'Source', hint: '←/→ to choose' }] : []),
    { key: 'project', label: 'Project' },
    { key: 'targetAgent', label: 'Agent', hint: '←/→ to choose' },
    { key: 'priority', label: 'Priority', hint: '0-9' },
    { key: 'description', label: 'Description' },
  ];

  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('');
  const [agentIndex, setAgentIndex] = useState(0);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [priority, setPriority] = useState('3');
  const [description, setDescription] = useState('');
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);

  const targetAgent = TARGET_AGENTS[agentIndex] as TargetAgent;
  const source = showSource ? sourceOptions[sourceIndex] : sourceOptions[0];
  const text: Record<FieldKey, string> = {
    taskId,
    title,
    project,
    targetAgent,
    priority,
    description,
    source: source ?? '',
  };
  const setText: Record<FieldKey, (v: string) => void> = {
    taskId: setTaskId,
    title: setTitle,
    project: setProject,
    targetAgent: () => {},
    priority: setPriority,
    description: setDescription,
    source: () => {},
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
      source: source || undefined,
    });
  };

  useInput((input, key) => {
    if (key.escape) return onCancel();
    const field = fields[index].key;

    if (key.return) return submit();
    if (key.ctrl && (input === 'r' || input === '') && onRefineDescription && !refining) {
      setRefining(true);
      setRefineError(null);
      Promise.resolve(onRefineDescription({ title: title.trim(), description: description.trim() }))
        .then(next => setDescription(next))
        .catch(err => setRefineError(err instanceof Error ? err.message : String(err)))
        .finally(() => setRefining(false));
      return;
    }
    if (key.tab && key.shift) return setIndex(i => (i - 1 + fields.length) % fields.length);
    if (key.tab || key.downArrow) return setIndex(i => (i + 1) % fields.length);
    if (key.upArrow) return setIndex(i => (i - 1 + fields.length) % fields.length);

    if (field === 'targetAgent') {
      if (key.rightArrow || input === ' ') setAgentIndex(i => (i + 1) % TARGET_AGENTS.length);
      else if (key.leftArrow) setAgentIndex(i => (i - 1 + TARGET_AGENTS.length) % TARGET_AGENTS.length);
      return;
    }
    if (field === 'source') {
      if (key.rightArrow || input === ' ') setSourceIndex(i => (i + 1) % sourceOptions.length);
      else if (key.leftArrow) setSourceIndex(i => (i - 1 + sourceOptions.length) % sourceOptions.length);
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
        {fields.map((f, i) => {
          const active = i === index;
          const value =
            f.key === 'targetAgent' ? `◀ ${targetAgent} ▶`
            : f.key === 'source' ? `◀ ${source} ▶`
            : text[f.key];
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
      {refining ? <Text color="yellow">Refining description…</Text> : null}
      {refineError ? <Text color="red">{refineError}</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
      <Box marginTop={1}>
        <Text dimColor>
          {submitting
            ? 'Creating…'
            : `[Tab/↑↓] field  [←/→] agent  [Enter] submit  [Esc] cancel${onRefineDescription ? '  [^R] refine' : ''}`}
        </Text>
      </Box>
    </Box>
  );
}
