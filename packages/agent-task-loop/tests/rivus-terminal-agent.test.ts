import {
  createAgentLoopToolExecutionEnd,
  createAgentLoopToolExecutionStart,
  createDefaultAgentRuntimeFromCallback,
  type RivusPluginRegistry,
  type RivusToolDescriptor,
} from '@rivus/agent';
import { describe, expect, it, vi } from 'vitest';
import { createRivusTaskManagerPlugin, TASK_GET_TOOL_ID } from '../src/rivus-plugin';
import { createTaskManagerApplication } from '../src/task-manager/task-manager-application';
import type { TaskProvider } from '../src/task-management/task-provider';
import type { TaskRecord } from '../src/types/task';

describe('local Rivus terminal Task Manager Agent', () => {
  it('queries a fake task through the Tool and returns only the redacted DTO', async () => {
    const provider = fakeTaskProvider({
      taskId: 'TASK-TERMINAL-1',
      title: 'Terminal smoke task',
      description: 'Verify the external Plugin boundary.',
      project: 'agent-task-loop',
      repository: 'example/project',
      source: 'github:example/project',
      targetAgent: 'codex',
      priority: 1,
      status: '执行中',
      progressSummary: 'Running the terminal scenario.',
      workspacePath: '/machine/workspace/task',
      logPath: '/machine/log/task.log',
      runId: 'private-run-id',
      sessionId: 'private-session-id',
      runnerPid: 44001,
      lastError: 'private provider error',
      publishBranch: 'feat/private-branch',
      publishCommit: 'private-commit',
    });
    const application = createTaskManagerApplication({
      taskProvider: provider,
      startTask: vi.fn(),
    });
    const tool = getTool(
      createRivusTaskManagerPlugin({ createTaskManager: async () => application }),
      TASK_GET_TOOL_ID,
    );
    const executor = tool.createExecutor({
      toolId: TASK_GET_TOOL_ID,
      toolVersion: tool.version,
    });
    const toolInput = { taskId: 'TASK-TERMINAL-1' };
    const runtime = createDefaultAgentRuntimeFromCallback(async input => {
      expect(input.text).toBe('Query task TASK-TERMINAL-1 and return its public task data.');
      const result = await executor.execute(toolInput, {
        agentId: 'task-manager',
        callId: 'terminal-call-1',
        instanceId: 'task-manager:terminal',
        policyEpoch: 1,
        runId: input.runId,
        sessionKey: input.sessionKey,
        toolId: TASK_GET_TOOL_ID,
        toolVersion: tool.version,
      });
      return [
        createAgentLoopToolExecutionStart({
          input: toolInput,
          toolCallId: 'terminal-call-1',
          toolName: TASK_GET_TOOL_ID,
        }),
        createAgentLoopToolExecutionEnd({
          isError: false,
          result,
          toolCallId: 'terminal-call-1',
          toolName: TASK_GET_TOOL_ID,
        }),
        JSON.stringify(result),
      ];
    }, {}, { mainSessionKey: 'local:task-manager:terminal-smoke' });

    const finalText = await runtime.promptText(
      'Query task TASK-TERMINAL-1 and return its public task data.',
    );
    const result = JSON.parse(finalText) as { task: Record<string, unknown> };

    expect(provider.getTaskById).toHaveBeenCalledWith('TASK-TERMINAL-1');
    expect(result).toEqual({
      task: {
        taskId: 'TASK-TERMINAL-1',
        title: 'Terminal smoke task',
        description: 'Verify the external Plugin boundary.',
        project: 'agent-task-loop',
        repository: 'example/project',
        source: 'github:example/project',
        targetAgent: 'codex',
        priority: 1,
        status: '执行中',
        progressSummary: 'Running the terminal scenario.',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /workspacePath|logPath|runId|sessionId|runnerPid|lastError|publishBranch|publishCommit/,
    );
  });
});

function getTool(
  plugin: { register(registry: RivusPluginRegistry): void },
  toolId: string,
): RivusToolDescriptor {
  const tools = new Map<string, RivusToolDescriptor>();
  plugin.register({
    registerAgentProfile: () => undefined,
    registerAutomation: () => undefined,
    registerSkill: () => undefined,
    registerTool: tool => tools.set(tool.id, tool),
  });
  const tool = tools.get(toolId);
  if (!tool) throw new Error(`Tool ${toolId} was not registered`);
  return tool;
}

function fakeTaskProvider(task: TaskRecord): TaskProvider {
  return {
    listTasks: vi.fn().mockResolvedValue([task]),
    listPendingTasks: vi.fn().mockResolvedValue([]),
    getTaskById: vi.fn().mockResolvedValue(task),
    createTask: vi.fn(),
    claimTask: vi.fn(),
    updateTaskProgress: vi.fn(),
    updateRunnerState: vi.fn(),
    updateTaskAssignment: vi.fn(),
    markTaskSucceeded: vi.fn(),
    markTaskFailed: vi.fn(),
    updateReviewState: vi.fn(),
    updatePublishResult: vi.fn(),
    updateCleanupState: vi.fn(),
  };
}
