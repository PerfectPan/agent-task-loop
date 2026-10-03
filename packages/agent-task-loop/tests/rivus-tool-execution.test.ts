import type { RivusPluginRegistry, RivusToolDescriptor, RivusToolExecutionContext } from '@rivus/agent';
import { assertRivusPluginConforms } from '@rivus/agent/testing';
import { describe, expect, it, vi } from 'vitest';
import { createRivusTaskManagerPlugin, TASK_GET_TOOL_ID, TASK_MANAGER_PROFILE_ID } from '../src/rivus-plugin';
import { createTaskManagerApplication } from '../src/task-manager/task-manager-application';
import type { TaskProvider } from '../src/task-management/task-provider';
import type { TaskRecord } from '../src/types/task';

describe('Rivus Task Manager tool execution', () => {
  it('queries a fake task through the Tool and returns only the redacted DTO', async () => {
    const provider = fakeTaskProvider({
      taskId: 'TASK-TOOL-1',
      title: 'Tool smoke task',
      description: 'Verify the external Plugin boundary.',
      project: 'agent-task-loop',
      repository: 'example/project',
      source: 'github:example/project',
      targetAgent: 'codex',
      priority: 1,
      status: '执行中',
      progressSummary: 'Running the tool scenario.',
      workspacePath: '/work/task',
      logPath: '/work/task.log',
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
    const plugin = createRivusTaskManagerPlugin({ createTaskManager: async () => application });
    const deployment = {
      agentId: 'task-reader',
      endpointIds: [],
      pluginId: 'agent-task-loop',
      profileId: TASK_MANAGER_PROFILE_ID,
      skills: { allow: [] },
      tools: { allow: [TASK_GET_TOOL_ID] },
    };
    await expect(assertRivusPluginConforms({ deployment, plugin })).resolves.toMatchObject({
      toolIds: [TASK_GET_TOOL_ID],
    });
    expect(provider.getTaskById).not.toHaveBeenCalled();

    const tool = getTool(plugin, TASK_GET_TOOL_ID);
    const executor = tool.createExecutor({
      toolId: TASK_GET_TOOL_ID,
      toolVersion: tool.version,
    });
    const toolInput = { taskId: 'TASK-TOOL-1' };
    const context: RivusToolExecutionContext = {
      agentId: deployment.agentId,
      callId: 'tool-call-1',
      instanceId: 'task-reader:tool-smoke',
      policyEpoch: 1,
      runId: 'tool-run-1',
      sessionKey: 'local:task-reader:tool-smoke',
      toolId: TASK_GET_TOOL_ID,
      toolVersion: tool.version,
    };
    const result = await executor.execute(toolInput, context);

    expect(provider.getTaskById).toHaveBeenCalledTimes(1);
    expect(provider.getTaskById).toHaveBeenCalledWith('TASK-TOOL-1');
    expect(result).toEqual({
      task: {
        taskId: 'TASK-TOOL-1',
        title: 'Tool smoke task',
        description: 'Verify the external Plugin boundary.',
        project: 'agent-task-loop',
        repository: 'example/project',
        source: 'github:example/project',
        targetAgent: 'codex',
        priority: 1,
        status: '执行中',
        progressSummary: 'Running the tool scenario.',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /workspacePath|logPath|runId|sessionId|runnerPid|lastError|publishBranch|publishCommit/,
    );
  });

  it('rejects an undeclared deployment tool grant before activating the application', async () => {
    const createTaskManager = vi.fn();
    const plugin = createRivusTaskManagerPlugin({ createTaskManager });

    await expect(
      assertRivusPluginConforms({
        deployment: {
          agentId: 'task-reader',
          endpointIds: [],
          pluginId: 'agent-task-loop',
          profileId: TASK_MANAGER_PROFILE_ID,
          skills: { allow: [] },
          tools: { allow: ['agent-task-loop/task-delete'] },
        },
        plugin,
      }),
    ).rejects.toThrow(/unknown deployment tool: agent-task-loop\/task-delete/);
    expect(createTaskManager).not.toHaveBeenCalled();
  });
});

function getTool(plugin: { register(registry: RivusPluginRegistry): void }, toolId: string): RivusToolDescriptor {
  const tools = new Map<string, RivusToolDescriptor>();
  plugin.register({
    registerAgentProfile: () => undefined,
    registerAutomation: () => undefined,
    registerSkill: () => undefined,
    registerTool: (tool) => tools.set(tool.id, tool),
  });
  const tool = tools.get(toolId);
  if (!tool) {
    throw new Error(`Tool ${toolId} was not registered`);
  }
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
