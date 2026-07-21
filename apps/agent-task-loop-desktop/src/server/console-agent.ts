import {
  createAgentLoopToolExecutionEnd,
  createAgentLoopToolExecutionStart,
  createDefaultAgentRuntimeFromCallback,
  type RivusPluginRegistry,
  type RivusToolDescriptor,
} from '@rivus/agent';
import {
  createRivusTaskManagerPlugin,
  TASK_CREATE_TOOL_ID,
  TASK_GET_TOOL_ID,
  TASK_LIST_TOOL_ID,
  TASK_START_TOOL_ID,
} from '@rivus/agent-task-loop/rivus-plugin';
import type {
  BackgroundStartService,
  PublicTaskDto,
  TaskManagerApplication,
} from '@rivus/agent-task-loop/task-manager';

export interface ConsoleAgentDependencies {
  application: TaskManagerApplication;
  backgroundStart: BackgroundStartService;
  /** Optional hook after a mutating tool runs (SSE refresh). */
  onMutation?: (taskId?: string) => void | Promise<void>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResult {
  reply: string;
  toolCalls: Array<{ toolId: string; ok: boolean; summary: string }>;
  sessionKey: string;
}

type ToolMap = Map<string, RivusToolDescriptor>;

/**
 * Local Rivus Task Manager agent for the desktop console.
 * Uses the same four Tools as the Rivus Plugin (list/get/create/start).
 * Start is routed through BackgroundStartService so HTTP/chat never block
 * on the full review loop. No Shell / filesystem / credential tools.
 */
export class ConsoleAgent {
  private readonly tools: ToolMap;
  private readonly sessions = new Map<string, ChatMessage[]>();

  constructor(private readonly deps: ConsoleAgentDependencies) {
    this.tools = loadTaskManagerTools(deps);
  }

  async chat(input: { message: string; sessionId?: string }): Promise<ChatResult> {
    const message = input.message.trim();
    if (!message) {
      return {
        reply: 'Send a message about tasks — for example “list open tasks” or “start TASK-101”.',
        toolCalls: [],
        sessionKey: input.sessionId ?? 'console',
      };
    }

    const sessionId = (input.sessionId ?? 'console').slice(0, 64);
    const sessionKey = `local:desktop-console:${sessionId}` as const;
    const history = this.sessions.get(sessionId) ?? [];
    history.push({ role: 'user', content: message.slice(0, 4_000) });

    const plan = planToolCalls(message, history);
    const toolCalls: ChatResult['toolCalls'] = [];
    const notes: string[] = [];

    if (plan.kind === 'help') {
      const reply = helpText();
      history.push({ role: 'assistant', content: reply });
      this.sessions.set(sessionId, history.slice(-40));
      return { reply, toolCalls, sessionKey };
    }

    if (plan.kind === 'tools') {
      for (const step of plan.steps) {
        const result = await this.executeTool(step.toolId, step.input);
        toolCalls.push(result.record);
        notes.push(result.note);
        if (result.mutated) {
          await this.deps.onMutation?.(result.taskId);
        }
      }
    }

    const reply = await this.composeReply(message, notes, toolCalls, sessionKey);
    history.push({ role: 'assistant', content: reply });
    this.sessions.set(sessionId, history.slice(-40));
    return { reply, toolCalls, sessionKey };
  }

  private async executeTool(
    toolId: string,
    toolInput: Record<string, unknown>,
  ): Promise<{ record: ChatResult['toolCalls'][number]; note: string; mutated: boolean; taskId?: string }> {
    // Desktop start must stay non-blocking — route through backgroundStart.
    if (toolId === TASK_START_TOOL_ID) {
      try {
        const taskId = String(toolInput.taskId ?? '');
        const result = await this.deps.backgroundStart.startTaskBackground({
          taskId,
          maxRounds: typeof toolInput.maxRounds === 'number' ? toolInput.maxRounds : 5,
          ...(typeof toolInput.targetAgent === 'string'
            ? { targetAgent: toolInput.targetAgent as 'claude' | 'codex' | 'coco' | 'glm' }
            : {}),
        });
        return {
          record: {
            toolId,
            ok: true,
            summary: `started ${result.taskId} (${result.runPhase})`,
          },
          note: formatStartNote(result.task, result.runPhase),
          mutated: true,
          taskId: result.taskId,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'start failed';
        return {
          record: { toolId, ok: false, summary: msg.slice(0, 200) },
          note: `Start failed: ${msg.slice(0, 200)}`,
          mutated: false,
        };
      }
    }

    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        record: { toolId, ok: false, summary: 'unknown tool' },
        note: `Unknown tool ${toolId}`,
        mutated: false,
      };
    }

    try {
      const executor = tool.createExecutor({ toolId, toolVersion: tool.version });
      const output = await executor.execute(toolInput, {
        agentId: 'task-manager',
        callId: `desktop-${Date.now()}`,
        instanceId: 'desktop-console',
        policyEpoch: 1,
        runId: `desktop-run-${Date.now()}`,
        sessionKey: 'local:desktop-console',
        toolId,
        toolVersion: tool.version,
      });
      const note = summarizeToolOutput(toolId, output);
      const taskId =
        toolId === TASK_CREATE_TOOL_ID && output && typeof output === 'object' && 'taskId' in output
          ? String((output as { taskId: string }).taskId)
          : toolId === TASK_GET_TOOL_ID && output && typeof output === 'object' && 'task' in output
            ? String((output as { task: PublicTaskDto }).task.taskId)
            : undefined;
      return {
        record: { toolId, ok: true, summary: note.slice(0, 160) },
        note,
        mutated: toolId === TASK_CREATE_TOOL_ID || toolId === TASK_START_TOOL_ID,
        taskId,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'tool failed';
      return {
        record: { toolId, ok: false, summary: msg.slice(0, 200) },
        note: `Tool ${shortTool(toolId)} failed: ${msg.slice(0, 200)}`,
        mutated: false,
      };
    }
  }

  private async composeReply(
    userMessage: string,
    notes: string[],
    toolCalls: ChatResult['toolCalls'],
    sessionKey: string,
  ): Promise<string> {
    if (notes.length === 0) {
      return [
        'I can manage tasks through the Rivus Task Manager tools (list, get, create, start).',
        'Try: “list tasks”, “show TASK-101”, “create a task titled Fix login”, or “start TASK-101”.',
        helpText(),
      ].join('\n');
    }

    // Optional Rivus runtime pass for natural phrasing (no extra tools).
    try {
      const runtime = createDefaultAgentRuntimeFromCallback(async input => {
        const body = [
          'You are the desktop Task Manager assistant.',
          'Rewrite the tool results into a concise operator-facing reply.',
          'Do not invent tasks. Do not mention credentials, paths, PIDs, or internal errors.',
          `User: ${userMessage}`,
          'Tool results:',
          ...notes.map(n => `- ${n}`),
        ].join('\n');
        // Echo a structured reply without model I/O — keeps offline deterministic.
        void input;
        return [formatOperatorReply(userMessage, notes, toolCalls)];
      }, {}, { mainSessionKey: sessionKey });
      const text = await runtime.promptText(userMessage);
      if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 6_000);
    } catch {
      // fall through
    }
    return formatOperatorReply(userMessage, notes, toolCalls);
  }
}

function loadTaskManagerTools(deps: ConsoleAgentDependencies): ToolMap {
  const plugin = createRivusTaskManagerPlugin({
    createTaskManager: async () => deps.application,
  });
  const map: ToolMap = new Map();
  const registry: RivusPluginRegistry = {
    registerTool(tool) {
      map.set(tool.id, tool);
    },
    registerAgentProfile() {
      /* profile not needed for direct tool exec */
    },
    registerSkill() {
      /* unused */
    },
    registerAutomation() {
      /* unused */
    },
  };
  plugin.register(registry);
  return map;
}

type Plan =
  | { kind: 'help' }
  | { kind: 'tools'; steps: Array<{ toolId: string; input: Record<string, unknown> }> }
  | { kind: 'none' };

function planToolCalls(message: string, _history: ChatMessage[]): Plan {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (/^(help|帮助|\?|commands?)$/i.test(text) || lower.includes('what can you')) {
    return { kind: 'help' };
  }

  const taskIdMatch =
    text.match(/\b(TASK[-_][A-Za-z0-9._-]+)\b/i) ??
    text.match(/(?:task|任务)\s*[#:]?\s*([A-Za-z0-9._-]{2,64})/i);
  const taskId = taskIdMatch?.[1] ? normalizeTaskId(taskIdMatch[1]) : undefined;

  if (/(list|列出|有哪些|show\s+all|看板|board)/i.test(text) && !taskId) {
    const status = matchStatus(text);
    const agent = matchAgent(text);
    return {
      kind: 'tools',
      steps: [
        {
          toolId: TASK_LIST_TOOL_ID,
          input: {
            limit: 30,
            ...(status ? { status } : {}),
            ...(agent ? { targetAgent: agent } : {}),
          },
        },
      ],
    };
  }

  if (taskId && /(start|启动|开始|恢复|resume|run|执行)/i.test(text)) {
    return {
      kind: 'tools',
      steps: [{ toolId: TASK_START_TOOL_ID, input: { taskId, maxRounds: 5 } }],
    };
  }

  if (taskId && /(get|show|详情|查看|status|状态)/i.test(text)) {
    return {
      kind: 'tools',
      steps: [{ toolId: TASK_GET_TOOL_ID, input: { taskId } }],
    };
  }

  if (/(create|新建|创建任务|new task)/i.test(text)) {
    const title =
      text.match(/(?:titled|title|标题)[:\s]+["“]?([^"”\n]+)["”]?/i)?.[1]?.trim() ??
      text.match(/(?:create|新建|创建)(?:\s+a)?(?:\s+task)?[:\s]+["“]?([^"”\n]{3,120})/i)?.[1]?.trim() ??
      'New desktop task';
    const id =
      taskId ??
      `TASK-${Date.now().toString(36).toUpperCase()}`;
    const agent = matchAgent(text) ?? 'codex';
    const project =
      text.match(/(?:project|项目)[:\s]+([A-Za-z0-9._/-]{1,80})/i)?.[1] ?? 'default';
    return {
      kind: 'tools',
      steps: [
        {
          toolId: TASK_CREATE_TOOL_ID,
          input: {
            taskId: id,
            title: title.slice(0, 200),
            project: project.slice(0, 120),
            targetAgent: agent,
            priority: 3,
            description: text.slice(0, 2_000),
          },
        },
      ],
    };
  }

  if (taskId) {
    return {
      kind: 'tools',
      steps: [{ toolId: TASK_GET_TOOL_ID, input: { taskId } }],
    };
  }

  // Default: list a small board snapshot so the agent always does something useful.
  if (text.length < 80) {
    return {
      kind: 'tools',
      steps: [{ toolId: TASK_LIST_TOOL_ID, input: { limit: 15 } }],
    };
  }

  return { kind: 'none' };
}

function normalizeTaskId(raw: string): string {
  const t = raw.trim();
  if (/^TASK[-_]/i.test(t)) return t.replace('_', '-').toUpperCase().replace(/^TASK-/, 'TASK-');
  if (/^task/i.test(t)) return t;
  return t.startsWith('TASK-') ? t : `TASK-${t}`;
}

function matchStatus(text: string): string | undefined {
  const statuses = [
    '待处理',
    '进行中',
    '执行中',
    '待复核',
    '修复中',
    '待决策',
    '待发布',
    '待验收',
    '已完成',
    '已失败',
  ];
  for (const s of statuses) {
    if (text.includes(s)) return s;
  }
  if (/failed|失败/i.test(text)) return '已失败';
  if (/done|完成/i.test(text)) return '已完成';
  if (/pending|待处理/i.test(text)) return '待处理';
  return undefined;
}

function matchAgent(text: string): 'claude' | 'codex' | 'coco' | 'glm' | undefined {
  const m = text.toLowerCase().match(/\b(claude|codex|coco|glm)\b/);
  return m ? (m[1] as 'claude' | 'codex' | 'coco' | 'glm') : undefined;
}

function shortTool(id: string): string {
  return id.replace('agent-task-loop/', '');
}

function summarizeToolOutput(toolId: string, output: unknown): string {
  if (!output || typeof output !== 'object') return `${shortTool(toolId)} ok`;
  const o = output as Record<string, unknown>;
  if (toolId === TASK_LIST_TOOL_ID && Array.isArray(o.tasks)) {
    const tasks = o.tasks as PublicTaskDto[];
    const lines = tasks.slice(0, 12).map(
      t => `${t.taskId} · ${t.status} · ${t.title}`.slice(0, 120),
    );
    const more = tasks.length > 12 ? `\n… +${tasks.length - 12} more` : '';
    return `Listed ${o.count ?? tasks.length} task(s)${o.truncated ? ' (truncated)' : ''}:\n${lines.join('\n')}${more}`;
  }
  if (toolId === TASK_GET_TOOL_ID && o.task && typeof o.task === 'object') {
    const t = o.task as PublicTaskDto;
    return [
      `${t.taskId} — ${t.title}`,
      `status ${t.status} · agent ${t.targetAgent} · priority ${t.priority}`,
      t.progressSummary ? `progress: ${t.progressSummary.slice(0, 240)}` : '',
      t.resultSummary ? `result: ${t.resultSummary.slice(0, 240)}` : '',
      t.prLink ? `pr: ${t.prLink}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (toolId === TASK_CREATE_TOOL_ID) {
    return `Created task ${String(o.taskId ?? '')}`.trim();
  }
  return `${shortTool(toolId)} completed`;
}

function formatStartNote(task: PublicTaskDto, runPhase: string): string {
  return `Started ${task.taskId} (${task.title}) — phase ${runPhase}, status ${task.status}. The execute/review loop continues in the background.`;
}

function formatOperatorReply(
  _user: string,
  notes: string[],
  toolCalls: ChatResult['toolCalls'],
): string {
  const failed = toolCalls.filter(t => !t.ok);
  const header = failed.length
    ? `Completed with ${failed.length} issue(s).`
    : toolCalls.length
      ? `Done — ${toolCalls.length} tool call(s).`
      : 'Done.';
  return [header, '', ...notes].join('\n').trim().slice(0, 6_000);
}

function helpText(): string {
  return [
    'Rivus Task Manager (desktop) — allowed tools only:',
    '• list tasks — optional status / agent filter',
    '• show TASK-xxx — task detail (public fields only)',
    '• create task titled … project … agent codex',
    '• start TASK-xxx — background execute/review loop',
    '',
    'I never expose paths, PIDs, sessions, or credentials.',
  ].join('\n');
}

// Keep imports used for parity with Rivus terminal composition (tree-shake safe).
void createAgentLoopToolExecutionStart;
void createAgentLoopToolExecutionEnd;
