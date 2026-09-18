import { assertRivusPluginConforms } from '@rivus/agent/testing';
import type {
  RivusAgentProfile,
  RivusPluginRegistry,
  RivusToolDescriptor,
  RivusToolExecutionContext,
} from '@rivus/agent';
import { RivusToolInputRejected } from '@rivus/agent';
import { describe, expect, it, vi } from 'vitest';
import {
  createRivusTaskManagerPlugin,
  TASK_CREATE_TOOL_ID,
  TASK_GET_TOOL_ID,
  TASK_LIST_TOOL_ID,
  TASK_MANAGER_PROFILE_ID,
  TASK_MANAGER_TOOL_IDS,
  TASK_START_TOOL_ID,
} from '../src/rivus-plugin';
import type { TaskManagerApplication } from '../src/task-manager/task-manager-application';
import { TaskManagerInputError } from '../src/task-manager/task-manager-application';

describe('agent-task-loop Rivus Plugin', () => {
  it('conforms with a Task Manager Profile and four exact Tools without activating dependencies', async () => {
    const createTaskManager = vi.fn();
    const plugin = createRivusTaskManagerPlugin({ createTaskManager });

    await expect(
      assertRivusPluginConforms({
        deployment: {
          agentId: 'task-manager',
          endpointIds: [],
          pluginId: 'agent-task-loop',
          profileId: TASK_MANAGER_PROFILE_ID,
          skills: { allow: [] },
          tools: { allow: TASK_MANAGER_TOOL_IDS },
        },
        lifecycle: {
          activate: async () => ({
            activeResources: () => 0,
            dispose: async () => undefined,
          }),
        },
        plugin,
      }),
    ).resolves.toMatchObject({
      pluginId: 'agent-task-loop',
      profileId: TASK_MANAGER_PROFILE_ID,
      toolIds: [...TASK_MANAGER_TOOL_IDS].sort(),
    });
    expect(createTaskManager).not.toHaveBeenCalled();
  });

  it('lets a Deployment narrow the Profile to observe-only Tools', async () => {
    const plugin = createRivusTaskManagerPlugin({ createTaskManager: vi.fn() });

    await expect(
      assertRivusPluginConforms({
        deployment: {
          agentId: 'task-reader',
          endpointIds: [],
          pluginId: 'agent-task-loop',
          profileId: TASK_MANAGER_PROFILE_ID,
          skills: { allow: [] },
          tools: { allow: ['agent-task-loop/task-list', 'agent-task-loop/task-get'] },
        },
        plugin,
      }),
    ).resolves.toMatchObject({
      toolIds: ['agent-task-loop/task-get', 'agent-task-loop/task-list'],
    });
  });

  it('routes task-list through the injected Task Manager capability once', async () => {
    const listTasks = vi.fn().mockResolvedValue({ count: 0, tasks: [], truncated: false });
    const application = fakeTaskManager({ listTasks });
    const createTaskManager = vi.fn().mockResolvedValue(application);
    const registrations = register(createRivusTaskManagerPlugin({ createTaskManager }));
    const listTool = registrations.tools.get(TASK_LIST_TOOL_ID)!;

    const result = await listTool.createExecutor({
      toolId: TASK_LIST_TOOL_ID,
      toolVersion: '1.0.0',
    }).execute(
      { status: '待处理', targetAgent: 'codex', limit: 10 },
      executionContext(TASK_LIST_TOOL_ID),
    );

    expect(createTaskManager).toHaveBeenCalledTimes(1);
    expect(listTasks).toHaveBeenCalledTimes(1);
    expect(listTasks).toHaveBeenCalledWith({ status: '待处理', targetAgent: 'codex', limit: 10 });
    expect(result).toEqual({ count: 0, tasks: [], truncated: false });
  });

  it('rejects invalid task-list input before constructing Task capabilities', async () => {
    const createTaskManager = vi.fn();
    const registrations = register(createRivusTaskManagerPlugin({ createTaskManager }));
    const executor = registrations.tools.get(TASK_LIST_TOOL_ID)!.createExecutor({
      toolId: TASK_LIST_TOOL_ID,
      toolVersion: '1.0.0',
    });

    await expect(
      executor.execute({ limit: 0, unexpected: true }, executionContext(TASK_LIST_TOOL_ID)),
    ).rejects.toBeInstanceOf(RivusToolInputRejected);
    expect(createTaskManager).not.toHaveBeenCalled();
  });

  it('returns a fixed bounded error for caller-controlled unknown property names', async () => {
    const createTaskManager = vi.fn();
    const executor = register(createRivusTaskManagerPlugin({ createTaskManager }))
      .tools.get(TASK_GET_TOOL_ID)!
      .createExecutor({ toolId: TASK_GET_TOOL_ID, toolVersion: '1.0.0' });
    const unknownProperty = `sensitive-${'x'.repeat(2_000)}`;

    await expect(
      executor.execute(
        { taskId: 'TASK-30', [unknownProperty]: true },
        executionContext(TASK_GET_TOOL_ID),
      ),
    ).rejects.toMatchObject({
      message: 'Invalid task-get input: contains unknown properties',
      name: 'RivusToolInputRejected',
    });
    expect(createTaskManager).not.toHaveBeenCalled();
  });

  it('rejects raw strings that exceed the registered JSON Schema length before trimming', async () => {
    const createTaskManager = vi.fn();
    const executor = register(createRivusTaskManagerPlugin({ createTaskManager }))
      .tools.get(TASK_CREATE_TOOL_ID)!
      .createExecutor({ toolId: TASK_CREATE_TOOL_ID, toolVersion: '1.0.0' });

    await expect(
      executor.execute({
        taskId: 'TASK-31',
        title: `${'x'.repeat(200)} `,
        project: 'project',
        targetAgent: 'codex',
        priority: 1,
      }, executionContext(TASK_CREATE_TOOL_ID)),
    ).rejects.toMatchObject({
      message: 'Invalid task-create title: exceeds its maximum length',
      name: 'RivusToolInputRejected',
    });
    expect(createTaskManager).not.toHaveBeenCalled();
  });

  it('routes task-get through the injected Task Manager capability', async () => {
    const expected = { task: { taskId: 'TASK-30' } };
    const getTask = vi.fn().mockResolvedValue(expected);
    const registrations = register(createRivusTaskManagerPlugin({
      createTaskManager: vi.fn().mockResolvedValue(fakeTaskManager({ getTask })),
    }));
    const executor = registrations.tools.get(TASK_GET_TOOL_ID)!.createExecutor({
      toolId: TASK_GET_TOOL_ID,
      toolVersion: '1.0.0',
    });

    await expect(
      executor.execute({ taskId: 'TASK-30' }, executionContext(TASK_GET_TOOL_ID)),
    ).resolves.toBe(expected);
    expect(getTask).toHaveBeenCalledWith({ taskId: 'TASK-30' });
  });

  it('routes task-create once with only validated public fields', async () => {
    const createTask = vi.fn().mockResolvedValue({ action: 'created', taskId: 'TASK-31' });
    const registrations = register(createRivusTaskManagerPlugin({
      createTaskManager: vi.fn().mockResolvedValue(fakeTaskManager({ createTask })),
    }));
    const executor = registrations.tools.get(TASK_CREATE_TOOL_ID)!.createExecutor({
      toolId: TASK_CREATE_TOOL_ID,
      toolVersion: '1.0.0',
    });
    const input = {
      taskId: 'TASK-31',
      title: 'Create through Rivus',
      project: 'project',
      targetAgent: 'codex',
      priority: 2,
      description: 'Use the existing Task Provider.',
      source: 'github:example/project',
    };

    await expect(executor.execute(input, executionContext(TASK_CREATE_TOOL_ID))).resolves.toEqual({
      action: 'created',
      taskId: 'TASK-31',
    });
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith(input);
  });

  it('routes task-start once and applies the bounded default round count', async () => {
    const result = { action: 'review-loop-completed', taskId: 'TASK-32', task: { taskId: 'TASK-32' } };
    const startTask = vi.fn().mockResolvedValue(result);
    const registrations = register(createRivusTaskManagerPlugin({
      createTaskManager: vi.fn().mockResolvedValue(fakeTaskManager({ startTask })),
    }));
    const executor = registrations.tools.get(TASK_START_TOOL_ID)!.createExecutor({
      toolId: TASK_START_TOOL_ID,
      toolVersion: '1.0.0',
    });

    await expect(
      executor.execute({ taskId: 'TASK-32' }, executionContext(TASK_START_TOOL_ID)),
    ).resolves.toBe(result);
    expect(startTask).toHaveBeenCalledTimes(1);
    expect(startTask).toHaveBeenCalledWith({ taskId: 'TASK-32', maxRounds: 5 });
  });

  it('registers strict versioned Schemas and no ambient Skill or Memory grants', () => {
    const registrations = register(createRivusTaskManagerPlugin({ createTaskManager: vi.fn() }));

    expect(registrations.profile.tools.allow).toEqual(TASK_MANAGER_TOOL_IDS);
    expect(registrations.profile.skills.allow).toEqual([]);
    expect(registrations.profile.memory.scopes).toEqual([]);
    expect([...registrations.tools.values()].map(tool => ({
      digest: tool.digest,
      id: tool.id,
      idempotency: tool.idempotency,
      risk: tool.risk,
      version: tool.version,
    }))).toEqual([
      {
        digest: 'sha256:f385f1d5c6ac3179535503e8da6188ce87e44f32ce5a308aeb54ed8664951946',
        id: TASK_LIST_TOOL_ID,
        idempotency: 'supported',
        risk: 'observe',
        version: '1.0.0',
      },
      {
        digest: 'sha256:6fd7cf15bbea116a4fa3986e83cb8dc0d7757b8b395a64e1b049943f14992e73',
        id: TASK_GET_TOOL_ID,
        idempotency: 'supported',
        risk: 'observe',
        version: '1.0.0',
      },
      {
        digest: 'sha256:39b31c0c7edfbb73b1f8109dfceb1fe02f403bd5df9aeb0bc54e0880edbf39f3',
        id: TASK_CREATE_TOOL_ID,
        idempotency: 'none',
        risk: 'mutate',
        version: '1.0.0',
      },
      {
        digest: 'sha256:94d3c0510b6589a93c50bc84bd1b67123732a7a4e72356bb11c879df2dbad538',
        id: TASK_START_TOOL_ID,
        idempotency: 'none',
        risk: 'mutate',
        version: '1.0.0',
      },
    ]);
    for (const tool of registrations.tools.values()) {
      expect(tool.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(tool.inputSchema).toMatchObject({ additionalProperties: false, type: 'object' });
    }
    expect(registrations.tools.get(TASK_GET_TOOL_ID)?.inputSchema).toMatchObject({
      required: ['taskId'],
    });
    expect(registrations.tools.get(TASK_CREATE_TOOL_ID)?.inputSchema).toMatchObject({
      required: ['taskId', 'title', 'project', 'targetAgent', 'priority'],
    });
    expect(registrations.tools.get(TASK_START_TOOL_ID)?.inputSchema).toMatchObject({
      required: ['taskId'],
    });
  });

  it('maps stable business input errors to the Rivus Tool boundary', async () => {
    const getTask = vi.fn().mockRejectedValue(
      new TaskManagerInputError('task-not-found', 'Task TASK-404 not found'),
    );
    const registrations = register(createRivusTaskManagerPlugin({
      createTaskManager: vi.fn().mockResolvedValue(fakeTaskManager({ getTask })),
    }));
    const executor = registrations.tools.get(TASK_GET_TOOL_ID)!.createExecutor({
      toolId: TASK_GET_TOOL_ID,
      toolVersion: '1.0.0',
    });

    await expect(
      executor.execute({ taskId: 'TASK-404' }, executionContext(TASK_GET_TOOL_ID)),
    ).rejects.toEqual(expect.objectContaining({
      message: 'Task TASK-404 not found',
      name: 'RivusToolInputRejected',
    }));
  });

  it.each([
    [TASK_GET_TOOL_ID, { taskId: 'TASK-1', unexpected: true }],
    [TASK_CREATE_TOOL_ID, { taskId: 'TASK-1', title: 'Missing fields' }],
    [TASK_START_TOOL_ID, { taskId: 'TASK-1', maxRounds: 21 }],
  ])('rejects invalid %s input without invoking the capability factory', async (toolId, input) => {
    const createTaskManager = vi.fn();
    const tool = register(createRivusTaskManagerPlugin({ createTaskManager })).tools.get(toolId)!;

    await expect(
      tool.createExecutor({ toolId, toolVersion: '1.0.0' }).execute(input, executionContext(toolId)),
    ).rejects.toBeInstanceOf(RivusToolInputRejected);
    expect(createTaskManager).not.toHaveBeenCalled();
  });
});

function register(plugin: { register(registry: RivusPluginRegistry): void }): {
  profile: RivusAgentProfile;
  tools: Map<string, RivusToolDescriptor>;
} {
  const profiles: RivusAgentProfile[] = [];
  const tools = new Map<string, RivusToolDescriptor>();
  plugin.register({
    registerAgentProfile: profile => profiles.push(profile),
    registerAutomation: () => undefined,
    registerSkill: () => undefined,
    registerTool: tool => tools.set(tool.id, tool),
  });
  if (!profiles[0]) throw new Error('Task Manager Profile was not registered');
  return { profile: profiles[0], tools };
}

function fakeTaskManager(overrides: Partial<TaskManagerApplication> = {}): TaskManagerApplication {
  return {
    listTasks: vi.fn(),
    getTask: vi.fn(),
    createTask: vi.fn(),
    startTask: vi.fn(),
    ...overrides,
  };
}

function executionContext(toolId: string): RivusToolExecutionContext {
  return {
    agentId: 'task-manager',
    callId: 'call-1',
    instanceId: 'task-manager:terminal',
    policyEpoch: 1,
    runId: 'run-1',
    sessionKey: 'local:task-manager:test',
    toolId,
    toolVersion: '1.0.0',
  };
}
