import { execa } from 'execa';
import {
  createRivusTaskManagerPlugin,
  TASK_CREATE_TOOL_ID,
  TASK_GET_TOOL_ID,
  TASK_LIST_TOOL_ID,
  TASK_START_TOOL_ID,
} from '@rivus/agent-task-loop/rivus-plugin';
import type {
  BackgroundStartService,
  DesktopWorkspaceSnapshot,
  PublicTaskDto,
  TaskManagerApplication,
} from '@rivus/agent-task-loop/task-manager';
import type { RivusPluginRegistry, RivusToolDescriptor } from '@rivus/agent';
import { z } from 'zod';

export interface ConsoleAgentDependencies {
  application: TaskManagerApplication;
  backgroundStart: BackgroundStartService;
  workspace: DesktopWorkspaceSnapshot;
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
  mode: 'model' | 'rules';
}

type ToolMap = Map<string, RivusToolDescriptor>;

const planSchema = z.object({
  steps: z
    .array(
      z.object({
        tool: z.enum(['list', 'get', 'create', 'start']),
        args: z.record(z.unknown()).default({}),
      }),
    )
    .max(5)
    .default([]),
  reply: z.string().max(4_000).optional(),
});

/**
 * Local Rivus Task Manager agent for the desktop console.
 *
 * - Tools: same four as the Rivus Plugin (list/get/create/start).
 * - Start goes through BackgroundStartService (non-blocking).
 * - When a coding agent is configured (prefer claude), free-form chat is
 *   planned by that model via JSON. Otherwise falls back to rule matching.
 */
export class ConsoleAgent {
  private readonly tools: ToolMap;
  private readonly sessions = new Map<string, ChatMessage[]>();

  constructor(private readonly deps: ConsoleAgentDependencies) {
    this.tools = loadTaskManagerTools(deps);
  }

  async chat(input: { message: string; sessionId?: string }): Promise<ChatResult> {
    const message = input.message.trim();
    const sessionId = (input.sessionId ?? 'console').slice(0, 64);
    const sessionKey = `local:desktop-console:${sessionId}`;

    if (!message) {
      return {
        reply: '可以说「列出任务」「查看 TASK-xxx」「启动 TASK-xxx」，或用自然语言描述你想做的事。',
        toolCalls: [],
        sessionKey,
        mode: 'rules',
      };
    }

    const history = this.sessions.get(sessionId) ?? [];
    history.push({ role: 'user', content: message.slice(0, 4_000) });

    let mode: 'model' | 'rules' = 'rules';
    let plan = await this.planWithRules(message);

    if (this.deps.workspace.chatAgent && !isTrivialHelp(message)) {
      try {
        const modelPlan = await this.planWithModel(message, history);
        if (modelPlan) {
          plan = modelPlan;
          mode = 'model';
        }
      } catch {
        // keep rules plan
      }
    }

    const toolCalls: ChatResult['toolCalls'] = [];
    const notes: string[] = [];

    if (plan.kind === 'help') {
      const reply = helpText(this.deps.workspace);
      history.push({ role: 'assistant', content: reply });
      this.sessions.set(sessionId, history.slice(-40));
      return { reply, toolCalls, sessionKey, mode };
    }

    if (plan.kind === 'tools') {
      for (const step of plan.steps) {
        const result = await this.executeTool(step.toolId, step.input);
        toolCalls.push(result.record);
        notes.push(result.note);
        if (result.mutated) await this.deps.onMutation?.(result.taskId);
      }
    }

    let reply =
      plan.kind === 'tools' && plan.modelReply
        ? plan.modelReply
        : formatOperatorReply(notes, toolCalls);

    if (mode === 'model' && notes.length > 0 && this.deps.workspace.chatAgent) {
      try {
        reply = await this.narrateWithModel(message, notes);
      } catch {
        // keep template reply
      }
    }

    if (!reply.trim()) {
      reply = notes.join('\n') || '已处理。';
    }

    history.push({ role: 'assistant', content: reply });
    this.sessions.set(sessionId, history.slice(-40));
    return { reply: reply.slice(0, 6_000), toolCalls, sessionKey, mode };
  }

  private async planWithModel(
    message: string,
    history: ChatMessage[],
  ): Promise<Plan | null> {
    const agent = this.deps.workspace.chatAgent;
    if (!agent) return null;

    const projects = this.deps.workspace.projects
      .map(p => `${p.key} (${p.name})`)
      .join(', ');
    const sources = this.deps.workspace.sources.join(', ');
    const recent = history
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = [
      'You are the desktop Task Manager for agent-task-loop.',
      'You may ONLY use these tools: list, get, create, start.',
      'Never invent paths, credentials, PIDs, or shell commands.',
      `Projects: ${projects || '(none)'}`,
      `Sources: ${sources || '(none)'}`,
      `Agents: ${this.deps.workspace.agents.join(', ') || '(none)'}`,
      '',
      'Return ONLY JSON matching:',
      '{"steps":[{"tool":"list|get|create|start","args":{...}}],"reply":"optional short Chinese reply"}',
      '',
      'Tool args:',
      '- list: {status?, targetAgent?, limit?}',
      '- get: {taskId}',
      '- create: {taskId,title,project,targetAgent,priority,description?}',
      '- start: {taskId,maxRounds?,targetAgent?}',
      '',
      'If the user only greets or asks capability, return {"steps":[],"reply":"..."}',
      'Recent chat:',
      recent || '(empty)',
      '',
      `User: ${message}`,
    ].join('\n');

    const raw = await runAgentText({
      command: agent.command,
      args: agent.args,
      env: agent.env,
      prompt,
      timeoutMs: 45_000,
    });

    const json = extractJsonObject(raw);
    if (!json) return null;
    const parsed = planSchema.safeParse(json);
    if (!parsed.success) return null;

    if (parsed.data.steps.length === 0) {
      return {
        kind: 'tools',
        steps: [],
        modelReply: parsed.data.reply?.trim() || helpText(this.deps.workspace),
      };
    }

    return {
      kind: 'tools',
      modelReply: parsed.data.reply?.trim(),
      steps: parsed.data.steps.map(step => ({
        toolId: toolIdFor(step.tool),
        input: normalizeArgs(step.tool, step.args, this.deps.workspace),
      })),
    };
  }

  private async narrateWithModel(userMessage: string, notes: string[]): Promise<string> {
    const agent = this.deps.workspace.chatAgent;
    if (!agent) return notes.join('\n');
    const prompt = [
      '用简洁中文向操作者汇报工具结果。不要编造。不要提路径/PID/凭据。',
      `用户：${userMessage}`,
      '工具结果：',
      ...notes.map(n => `- ${n}`),
    ].join('\n');
    const text = await runAgentText({
      command: agent.command,
      args: agent.args,
      env: agent.env,
      prompt,
      timeoutMs: 30_000,
    });
    return text.trim().slice(0, 4_000) || notes.join('\n');
  }

  private async planWithRules(message: string): Promise<Plan> {
    const text = message.trim();
    const lower = text.toLowerCase();

    if (isTrivialHelp(text)) return { kind: 'help' };

    const taskIdMatch =
      text.match(/\b([A-Z][A-Z0-9]*[-_][A-Za-z0-9._-]+)\b/) ??
      text.match(/(?:task|任务)\s*[#:]?\s*([A-Za-z0-9._-]{2,64})/i);
    const taskId = taskIdMatch?.[1] ? String(taskIdMatch[1]) : undefined;

    if (/(list|列出|有哪些|看板|board|全部任务)/i.test(text) && !/(start|启动)/i.test(text)) {
      return {
        kind: 'tools',
        steps: [
          {
            toolId: TASK_LIST_TOOL_ID,
            input: {
              limit: 30,
              ...(matchStatus(text) ? { status: matchStatus(text) } : {}),
              ...(matchAgent(text) ? { targetAgent: matchAgent(text) } : {}),
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
        '新任务';
      const project =
        text.match(/(?:project|项目)[:\s]+([A-Za-z0-9._/-]{1,80})/i)?.[1] ??
        this.deps.workspace.projects[0]?.key ??
        'default';
      const id = taskId ?? `TASK-${Date.now().toString(36).toUpperCase()}`;
      return {
        kind: 'tools',
        steps: [
          {
            toolId: TASK_CREATE_TOOL_ID,
            input: {
              taskId: id,
              title: title.slice(0, 200),
              project: project.slice(0, 120),
              targetAgent: matchAgent(text) ?? this.deps.workspace.agents[0] ?? 'codex',
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

    if (lower.length < 40 || /(任务|task|状态)/i.test(text)) {
      return {
        kind: 'tools',
        steps: [{ toolId: TASK_LIST_TOOL_ID, input: { limit: 15 } }],
      };
    }

    return { kind: 'help' };
  }

  private async executeTool(
    toolId: string,
    toolInput: Record<string, unknown>,
  ): Promise<{ record: ChatResult['toolCalls'][number]; note: string; mutated: boolean; taskId?: string }> {
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
          record: { toolId, ok: true, summary: `started ${result.taskId} (${result.runPhase})` },
          note: `已后台启动 ${result.taskId}（${result.task.title}），阶段 ${result.runPhase}，状态 ${result.task.status}`,
          mutated: true,
          taskId: result.taskId,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'start failed';
        return {
          record: { toolId, ok: false, summary: msg.slice(0, 200) },
          note: `启动失败：${msg.slice(0, 200)}`,
          mutated: false,
        };
      }
    }

    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        record: { toolId, ok: false, summary: 'unknown tool' },
        note: `未知工具 ${toolId}`,
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
        note: `工具失败：${msg.slice(0, 200)}`,
        mutated: false,
      };
    }
  }
}

type Plan =
  | { kind: 'help' }
  | {
      kind: 'tools';
      steps: Array<{ toolId: string; input: Record<string, unknown> }>;
      modelReply?: string;
    };

function loadTaskManagerTools(deps: ConsoleAgentDependencies): ToolMap {
  const plugin = createRivusTaskManagerPlugin({
    createTaskManager: async () => deps.application,
  });
  const map: ToolMap = new Map();
  const registry: RivusPluginRegistry = {
    registerTool(tool) {
      map.set(tool.id, tool);
    },
    registerAgentProfile() {},
    registerSkill() {},
    registerAutomation() {},
  };
  plugin.register(registry);
  return map;
}

function toolIdFor(tool: 'list' | 'get' | 'create' | 'start'): string {
  switch (tool) {
    case 'list':
      return TASK_LIST_TOOL_ID;
    case 'get':
      return TASK_GET_TOOL_ID;
    case 'create':
      return TASK_CREATE_TOOL_ID;
    case 'start':
      return TASK_START_TOOL_ID;
  }
}

function normalizeArgs(
  tool: 'list' | 'get' | 'create' | 'start',
  args: Record<string, unknown>,
  workspace: DesktopWorkspaceSnapshot,
): Record<string, unknown> {
  if (tool === 'list') {
    return {
      limit: typeof args.limit === 'number' ? args.limit : 30,
      ...(typeof args.status === 'string' ? { status: args.status } : {}),
      ...(typeof args.targetAgent === 'string' ? { targetAgent: args.targetAgent } : {}),
    };
  }
  if (tool === 'get' || tool === 'start') {
    return {
      taskId: String(args.taskId ?? ''),
      ...(tool === 'start'
        ? {
            maxRounds: typeof args.maxRounds === 'number' ? args.maxRounds : 5,
            ...(typeof args.targetAgent === 'string' ? { targetAgent: args.targetAgent } : {}),
          }
        : {}),
    };
  }
  // create
  const project =
    typeof args.project === 'string' && args.project.trim()
      ? args.project
      : workspace.projects[0]?.key ?? 'default';
  return {
    taskId: String(args.taskId ?? `TASK-${Date.now().toString(36).toUpperCase()}`),
    title: String(args.title ?? '新任务').slice(0, 200),
    project: String(project).slice(0, 120),
    targetAgent: String(args.targetAgent ?? workspace.agents[0] ?? 'codex'),
    priority: typeof args.priority === 'number' ? args.priority : 3,
    ...(typeof args.description === 'string' ? { description: args.description.slice(0, 4_000) } : {}),
    ...(typeof args.source === 'string' ? { source: args.source } : {}),
  };
}

async function runAgentText(input: {
  command: string;
  args: string[];
  env: Record<string, string>;
  prompt: string;
  timeoutMs: number;
}): Promise<string> {
  // Prefer non-interactive print mode used by Claude CLI.
  const result = await execa(
    input.command,
    [...input.args, '-p', input.prompt],
    {
      env: { ...process.env, ...input.env },
      timeout: input.timeoutMs,
      reject: false,
      all: true,
    },
  );
  const text = (result.all || result.stdout || result.stderr || '').trim();
  if (!text) {
    throw new Error(result.stderr || 'agent returned empty output');
  }
  return text;
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isTrivialHelp(text: string): boolean {
  return /^(help|帮助|\?|commands?|你好|hi|hello)$/i.test(text.trim())
    || /能做什么|what can you/i.test(text);
}

function matchStatus(text: string): string | undefined {
  const statuses = [
    '待处理', '进行中', '执行中', '待复核', '修复中', '待决策', '待发布', '待验收', '已完成', '已失败',
  ];
  for (const s of statuses) if (text.includes(s)) return s;
  if (/failed|失败/i.test(text)) return '已失败';
  if (/done|完成/i.test(text)) return '已完成';
  return undefined;
}

function matchAgent(text: string): string | undefined {
  const m = text.toLowerCase().match(/\b(claude|codex|coco|glm)\b/);
  return m?.[1];
}

function summarizeToolOutput(toolId: string, output: unknown): string {
  if (!output || typeof output !== 'object') return `${toolId} ok`;
  const o = output as Record<string, unknown>;
  if (toolId === TASK_LIST_TOOL_ID && Array.isArray(o.tasks)) {
    const tasks = o.tasks as PublicTaskDto[];
    const lines = tasks.slice(0, 12).map(t => `${t.taskId} · ${t.status} · ${t.title}`.slice(0, 120));
    const more = tasks.length > 12 ? `\n… 另有 ${tasks.length - 12} 条` : '';
    return `共 ${o.count ?? tasks.length} 条任务${o.truncated ? '（已截断）' : ''}：\n${lines.join('\n')}${more}`;
  }
  if (toolId === TASK_GET_TOOL_ID && o.task && typeof o.task === 'object') {
    const t = o.task as PublicTaskDto;
    return [
      `${t.taskId} — ${t.title}`,
      `状态 ${t.status} · agent ${t.targetAgent} · P${t.priority}`,
      t.progressSummary ? `进度：${t.progressSummary.slice(0, 240)}` : '',
      t.resultSummary ? `结果：${t.resultSummary.slice(0, 240)}` : '',
      t.prLink ? `PR：${t.prLink}` : '',
    ].filter(Boolean).join('\n');
  }
  if (toolId === TASK_CREATE_TOOL_ID) {
    return `已创建任务 ${String(o.taskId ?? '')}`.trim();
  }
  return '完成';
}

function formatOperatorReply(
  notes: string[],
  toolCalls: ChatResult['toolCalls'],
): string {
  if (!notes.length) return helpText({ projects: [], sources: [], agents: [] });
  const failed = toolCalls.filter(t => !t.ok).length;
  const header = failed ? `完成，但有 ${failed} 处失败。` : '完成。';
  return [header, '', ...notes].join('\n').trim();
}

function helpText(workspace: Pick<DesktopWorkspaceSnapshot, 'projects' | 'sources' | 'agents' | 'chatAgent'>): string {
  return [
    '我是桌面端 Task Manager（Rivus 四工具）：list / get / create / start。',
    workspace.chatAgent
      ? `对话模型：已绑定本地 agent「${workspace.chatAgent.name}」（${workspace.chatAgent.command}），自由描述我会规划工具调用。`
      : '当前未配置可用 coding agent，仅支持关键词规则（列出/查看/创建/启动）。在 ~/.agent-task-loop/config.json 配置 agents.claude 等后可启用模型对话。',
    `项目：${workspace.projects.map(p => p.key).join(', ') || '（无）'}`,
    `来源：${workspace.sources.join(', ') || '（无）'}`,
    `Agents：${workspace.agents.join(', ') || '（无）'}`,
  ].join('\n');
}
