import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { TaskRecord } from '../../types/task';
import type { FetchTasks, Now, Pane, PreviewMode } from '../types';
import type { SessionProvider } from '../data/session-provider';
import { sortTasks } from '../logic/sort';
import { filterTasks } from '../logic/filter';
import { clampIndex, nextIndex } from '../logic/viewport';
import { computeColumnWidths, reservedRows } from '../logic/layout';
import { clampScroll, maxScroll, wrappedLineCount } from '../logic/measure';
import { formatDetailFields } from '../logic/format';
import { TABS, type TabKey, tabIncludes } from '../logic/status';
import { nextPane, nextPreviewMode, prevPane } from '../logic/pane';
import { useTaskPoll } from '../hooks/use-task-poll';
import { useSessionPreview } from '../hooks/use-session-preview';
import { useTranscript } from '../hooks/use-transcript';
import { useTerminalSize } from '../hooks/use-terminal-size';
import { Header } from './Header';
import { Tabs } from './Tabs';
import { TaskList } from './TaskList';
import { TaskDetail } from './TaskDetail';
import { SessionPreview } from './SessionPreview';
import { StatusBar } from './StatusBar';
import { HelpOverlay } from './HelpOverlay';
import { WorkflowOverlay } from './WorkflowOverlay';
import { TaskForm } from './TaskForm';
import type { CreateTaskPayload } from '../../task-management/task-provider';
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
  /** Creates a new task (n). Without it, the new-task form is disabled. */
  onCreateTask?: (payload: CreateTaskPayload) => Promise<void>;
  /**
   * Backends a new task can be created in (capability-aware: only create-capable
   * sources). When more than one, the new-task form shows a source selector.
   */
  sources?: string[];
  /** When provided, the new-task form can AI-refine the description (Ctrl+R). */
  onRefineDescription?: (input: { title: string; description: string }) => Promise<string>;
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
  onCreateTask,
  sources,
  onRefineDescription,
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
  const [workflowVisible, setWorkflowVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [detailScroll, setDetailScroll] = useState(0);
  const [previewScroll, setPreviewScroll] = useState(0);
  // -1 means "latest round"; a concrete index once the user navigates rounds.
  const [roundIndex, setRoundIndex] = useState(-1);
  // Session ids with a transcript on disk, so rounds can be marked viewable.
  const [availableIds, setAvailableIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let active = true;
    Promise.resolve(sessionProvider.listAvailableSessionIds())
      .then(ids => {
        if (active) setAvailableIds(new Set(ids));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionProvider]);

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

  // Tag rows with their backend when more than one source is in play — either
  // configured (multi-source setup) or actually present in the fetched tasks.
  const showSource = useMemo(
    () => (sources?.length ?? 0) > 1 || new Set(tasks.map(task => task.source).filter(Boolean)).size > 1,
    [sources, tasks],
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
  // The body sits between the bordered header (3 rows), the tab bar (1) and the
  // footer (1); pin its height so a tall pane can't push the chrome off-screen.
  const bodyHeight = Math.max(1, rows - 5);

  // Rounds (each its own agent session) and which one is selected for drill-in.
  const history = preview?.history ?? [];
  const effRound = roundIndex < 0 ? Math.max(0, history.length - 1) : clampIndex(roundIndex, history.length);
  const selectedRound = history[effRound];
  const transcriptSessionId =
    previewMode === 'logs' ? selectedRound?.sessionId ?? selected?.executionSessionId ?? null : null;
  const { lines: transcript, isLoading: transcriptLoading } = useTranscript(
    sessionProvider,
    transcriptSessionId ?? null,
  );

  // A new selection (or preview mode / round) starts scrolled back at the top.
  const selectedId = selected?.taskId ?? null;
  useEffect(() => {
    setDetailScroll(0);
    setPreviewScroll(0);
    setRoundIndex(-1);
  }, [selectedId]);
  useEffect(() => {
    setPreviewScroll(0);
  }, [previewMode, effRound]);

  // Estimate each scrollable pane's content height so scrolling can be clamped.
  const paneViewport = Math.max(1, visibleRows - 1);
  const detailLines = selected
    ? 1 +
      formatDetailFields(selected, nowMs).length +
      (selected.progressSummary ? 1 + wrappedLineCount(selected.progressSummary, Math.max(1, colWidths.detail - 4)) : 0) +
      (selected.lastError ? 1 + wrappedLineCount(selected.lastError, Math.max(1, colWidths.detail - 4)) : 0) +
      4
    : 1;
  const previewInner = Math.max(1, colWidths.preview - 4);
  const transcriptHeight = transcript.reduce((n, l) => n + wrappedLineCount(l, previewInner) + 1, 2);
  const previewLines = !preview
    ? 1
    : previewMode === 'logs'
      ? transcriptHeight
      : previewMode === 'history'
        ? preview.history.length + 1
        : 8 + Math.min(4, preview.history.length);
  const detailMax = maxScroll(detailLines, paneViewport);
  const previewMax = maxScroll(previewLines, paneViewport);

  const submitNewTask = useCallback(
    async (payload: CreateTaskPayload) => {
      if (!onCreateTask) return;
      setCreating(true);
      setCreateError(null);
      try {
        await onCreateTask(payload);
        setFormVisible(false);
        refetch();
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : String(err));
      } finally {
        setCreating(false);
      }
    },
    [onCreateTask, refetch],
  );

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

  // --- help / workflow overlays: any key closes ---
  useInput(
    () => {
      setHelpVisible(false);
    },
    { isActive: helpVisible && !confirm },
  );
  useInput(
    () => {
      setWorkflowVisible(false);
    },
    { isActive: workflowVisible && !confirm },
  );

  // --- main navigation / actions ---
  useInput(
    (input, key) => {
      const previewRounds = focusedPane === 'preview' && previewMode === 'history';
      if (key.upArrow || input === 'k') {
        if (focusedPane === 'detail') setDetailScroll(s => clampScroll(s - 1, detailLines, paneViewport));
        else if (previewRounds) setRoundIndex(clampIndex(effRound - 1, history.length));
        else if (focusedPane === 'preview') setPreviewScroll(s => clampScroll(s - 1, previewLines, paneViewport));
        else setSelectedIndex(i => nextIndex(clampIndex(i, len), -1, len));
      } else if (key.downArrow || input === 'j') {
        if (focusedPane === 'detail') setDetailScroll(s => clampScroll(s + 1, detailLines, paneViewport));
        else if (previewRounds) setRoundIndex(clampIndex(effRound + 1, history.length));
        else if (focusedPane === 'preview') setPreviewScroll(s => clampScroll(s + 1, previewLines, paneViewport));
        else setSelectedIndex(i => nextIndex(clampIndex(i, len), 1, len));
      } else if (input === 'g') {
        if (focusedPane === 'detail') setDetailScroll(0);
        else if (previewRounds) setRoundIndex(0);
        else if (focusedPane === 'preview') setPreviewScroll(0);
        else setSelectedIndex(0);
      } else if (input === 'G') {
        if (focusedPane === 'detail') setDetailScroll(detailMax);
        else if (previewRounds) setRoundIndex(Math.max(0, history.length - 1));
        else if (focusedPane === 'preview') setPreviewScroll(previewMax);
        else setSelectedIndex(Math.max(0, len - 1));
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
      } else if (input === 'w') {
        setWorkflowVisible(true);
      } else if (input === 'n' && onCreateTask) {
        setCreateError(null);
        setFormVisible(true);
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
      } else if (key.return) {
        // In the rounds list, Enter drills into that round's transcript.
        if (previewRounds) setPreviewMode('logs');
        else if (selected) onAttachTask?.(selected);
      } else if (input === 'q' || key.escape) {
        exit();
      }
    },
    { isActive: !filtering && !helpVisible && !workflowVisible && !formVisible && !confirm },
  );

  return (
    <ResizeGuard columns={columns} rows={rows}>
      <Box flexDirection="column" width={columns} height={rows}>
        <Header
          agent={agent}
          taskCount={tasks.length}
          lastFetchedAt={lastFetchedAt == null ? undefined : new Date(lastFetchedAt).toISOString()}
          now={nowMs}
          filterText={filtering ? query : undefined}
        />
        <Tabs active={tab} counts={counts} />
        {helpVisible ? (
          <Box height={bodyHeight} minHeight={0}>
            <HelpOverlay visible />
          </Box>
        ) : workflowVisible ? (
          <Box height={bodyHeight} minHeight={0}>
            <WorkflowOverlay visible currentStatus={selected?.status} />
          </Box>
        ) : formVisible ? (
          <Box height={bodyHeight} minHeight={0}>
            <TaskForm
              onSubmit={submitNewTask}
              onCancel={() => setFormVisible(false)}
              submitting={creating}
              error={createError}
              sources={sources}
              onRefineDescription={onRefineDescription}
            />
          </Box>
        ) : (
          <Box flexDirection="row" height={bodyHeight} minHeight={0}>
            <TaskList
              tasks={visible}
              selectedIndex={selIdx}
              visibleRows={visibleRows}
              width={colWidths.list}
              focused={focusedPane === 'list'}
              showSource={showSource}
            />
            <TaskDetail
              task={selected}
              now={nowMs}
              width={colWidths.detail}
              focused={focusedPane === 'detail'}
              scroll={detailScroll}
            />
            {previewOpen ? (
              <SessionPreview
                preview={preview}
                mode={previewMode}
                width={colWidths.preview}
                focused={focusedPane === 'preview'}
                isLoading={previewLoading}
                scroll={previewScroll}
                roundIndex={effRound}
                transcript={transcript}
                transcriptLoading={transcriptLoading}
                availableIds={availableIds}
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
        <StatusBar focusedPane={focusedPane} filtering={filtering} canCreate={!!onCreateTask} />
      </Box>
    </ResizeGuard>
  );
}
