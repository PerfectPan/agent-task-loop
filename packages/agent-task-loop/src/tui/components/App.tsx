import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { TaskRecord } from '../../types/task';
import type { FetchTasks, Now, Pane, PreviewMode } from '../types';
import type { SessionProvider } from '../data/session-provider';
import { sortTasks } from '../logic/sort';
import { filterTasks } from '../logic/filter';
import { clampIndex, nextIndex } from '../logic/viewport';
import { computeColumnWidths, reservedRows } from '../logic/layout';
import { TABS, type TabKey, tabIncludes } from '../logic/status';
import { nextPane, nextPreviewMode, prevPane } from '../logic/pane';
import { useTaskPoll } from '../hooks/use-task-poll';
import { useSessionPreview } from '../hooks/use-session-preview';
import { useTerminalSize } from '../hooks/use-terminal-size';
import { Header } from './Header';
import { Tabs } from './Tabs';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';
import { SessionPreview } from './SessionPreview';
import { StatusBar } from './StatusBar';
import { HelpOverlay } from './HelpOverlay';
import { ConfirmPrompt } from './ConfirmPrompt';
import { ResizeGuard } from './ResizeGuard';

export interface AppProps {
  onFetchTasks: FetchTasks;
  sessionProvider: SessionProvider;
  agent: string;
  now?: Now;
  taskIntervalMs?: number;
  previewIntervalMs?: number;
  /** Optional hook for the destructive "stop runner" action (d/x). */
  onStopTask?: (task: TaskRecord) => void;
  /** Optional hook for "attach into session" (Enter). */
  onAttachTask?: (task: TaskRecord) => void;
}

interface Confirmation {
  message: string;
  onConfirm: () => void;
}

export function App({
  onFetchTasks,
  sessionProvider,
  agent,
  now = () => Date.now(),
  taskIntervalMs = 5000,
  previewIntervalMs = 3000,
  onStopTask,
  onAttachTask,
}: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();

  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedPane, setFocusedPane] = useState<Pane>('list');
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('output');
  const [helpVisible, setHelpVisible] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);

  const nowMs = now();

  const { tasks, lastFetchedAt, refetch } = useTaskPoll(onFetchTasks, {
    intervalMs: taskIntervalMs,
  });

  const counts = useMemo<Record<TabKey, number>>(() => {
    const base = { active: 0, 'needs-input': 0, done: 0, all: 0 } as Record<TabKey, number>;
    for (const task of tasks) {
      for (const def of TABS) {
        if (tabIncludes(def.key, task.status)) base[def.key] += 1;
      }
    }
    return base;
  }, [tasks]);

  const visible = useMemo(
    () => sortTasks(filterTasks(tasks, { tab, query })),
    [tasks, tab, query],
  );

  const len = visible.length;
  const selIdx = clampIndex(selectedIndex, len);
  const selected = len > 0 ? visible[selIdx] : null;

  // Reset the cursor when the visible set changes shape.
  useEffect(() => {
    setSelectedIndex(0);
  }, [tab, query]);

  const { preview, isLoading: previewLoading } = useSessionPreview(
    sessionProvider,
    selected,
    { intervalMs: previewIntervalMs, now },
  );

  const colWidths = computeColumnWidths(columns, { previewOpen });
  const visibleRows = Math.max(1, rows - reservedRows());

  const togglePreview = useCallback(() => {
    setPreviewOpen(open => {
      const next = !open;
      if (!next) setFocusedPane(p => (p === 'preview' ? 'list' : p));
      return next;
    });
  }, []);

  // --- filter input mode ---
  useInput(
    (input, key) => {
      if (key.escape) {
        setFiltering(false);
        setQuery('');
      } else if (key.return) {
        setFiltering(false);
      } else if (key.backspace || key.delete) {
        setQuery(q => q.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setQuery(q => q + input);
      }
    },
    { isActive: filtering },
  );

  // --- help overlay: any key closes ---
  useInput(
    () => {
      setHelpVisible(false);
    },
    { isActive: helpVisible && !confirm },
  );

  // --- main navigation / actions ---
  useInput(
    (input, key) => {
      if (key.upArrow || input === 'k') {
        setSelectedIndex(i => nextIndex(clampIndex(i, len), -1, len));
      } else if (key.downArrow || input === 'j') {
        setSelectedIndex(i => nextIndex(clampIndex(i, len), 1, len));
      } else if (input === 'g') {
        setSelectedIndex(0);
      } else if (input === 'G') {
        setSelectedIndex(Math.max(0, len - 1));
      } else if (key.tab && key.shift) {
        setFocusedPane(p => prevPane(p, previewOpen));
      } else if (key.tab) {
        setFocusedPane(p => nextPane(p, previewOpen));
      } else if (input === 'm') {
        setPreviewMode(m => nextPreviewMode(m));
      } else if (input === 'p') {
        togglePreview();
      } else if (input === '/') {
        setFiltering(true);
      } else if (input === 'r') {
        refetch();
      } else if (input === '?') {
        setHelpVisible(true);
      } else if (/^[1-9]$/.test(input) && Number(input) <= TABS.length) {
        setTab(TABS[Number(input) - 1].key);
      } else if (input === ']') {
        setTab(t => TABS[(TABS.findIndex(x => x.key === t) + 1) % TABS.length].key);
      } else if (input === '[') {
        setTab(t => TABS[(TABS.findIndex(x => x.key === t) - 1 + TABS.length) % TABS.length].key);
      } else if ((input === 'd' || input === 'x') && selected) {
        const task = selected;
        setConfirm({
          message: `Stop runner for ${task.taskId}?`,
          onConfirm: () => {
            onStopTask?.(task);
            setConfirm(null);
          },
        });
      } else if (key.return && selected) {
        onAttachTask?.(selected);
      } else if (input === 'q' || key.escape) {
        exit();
      }
    },
    { isActive: !filtering && !helpVisible && !confirm },
  );

  return (
    <ResizeGuard columns={columns} rows={rows}>
      <Box flexDirection="column" width={columns}>
        <Header
          agent={agent}
          taskCount={tasks.length}
          lastFetchedAt={lastFetchedAt == null ? undefined : new Date(lastFetchedAt).toISOString()}
          now={nowMs}
          filterText={filtering ? query : undefined}
        />
        <Tabs active={tab} counts={counts} />
        {helpVisible ? (
          <HelpOverlay visible />
        ) : (
          <Box flexDirection="row">
            <TaskList
              tasks={visible}
              selectedIndex={selIdx}
              visibleRows={visibleRows}
              width={colWidths.list}
              focused={focusedPane === 'list'}
            />
            <TaskDetail
              task={selected}
              now={nowMs}
              width={colWidths.detail}
              focused={focusedPane === 'detail'}
            />
            {previewOpen ? (
              <SessionPreview
                preview={preview}
                mode={previewMode}
                width={colWidths.preview}
                focused={focusedPane === 'preview'}
                isLoading={previewLoading}
              />
            ) : null}
          </Box>
        )}
        {confirm ? (
          <ConfirmPrompt
            message={confirm.message}
            onConfirm={confirm.onConfirm}
            onCancel={() => setConfirm(null)}
          />
        ) : null}
        <StatusBar focusedPane={focusedPane} filtering={filtering} />
      </Box>
    </ResizeGuard>
  );
}
