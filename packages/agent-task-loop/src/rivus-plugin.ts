import {
  RIVUS_PLUGIN_API_VERSION,
  RivusToolInputRejected,
  type RivusPlugin,
  type RivusPluginRegistry,
  type RivusToolDescriptor,
} from '@rivus/agent';
import type {
  TaskManagerApplication,
} from './task-manager/task-manager-application';
import {
  TaskManagerInputError,
  TaskManagerOperationError,
} from './task-manager/task-manager-application';
import {
  createTaskInputJsonSchema,
  createTaskInputSchema,
  getTaskInputJsonSchema,
  getTaskInputSchema,
  listTasksInputJsonSchema,
  listTasksInputSchema,
  startTaskInputJsonSchema,
  startTaskInputSchema,
} from './task-manager/rivus-tool-contracts';

export const TASK_MANAGER_PROFILE_ID = 'task-manager';
export const TASK_LIST_TOOL_ID = 'agent-task-loop/task-list';
export const TASK_GET_TOOL_ID = 'agent-task-loop/task-get';
export const TASK_CREATE_TOOL_ID = 'agent-task-loop/task-create';
export const TASK_START_TOOL_ID = 'agent-task-loop/task-start';
export const TASK_MANAGER_TOOL_IDS = [
  TASK_LIST_TOOL_ID,
  TASK_GET_TOOL_ID,
  TASK_CREATE_TOOL_ID,
  TASK_START_TOOL_ID,
] as const;

export interface RivusTaskManagerPluginDependencies {
  createTaskManager?: () => Promise<TaskManagerApplication>;
}

export function createRivusTaskManagerPlugin(
  dependencies: RivusTaskManagerPluginDependencies = {},
): RivusPlugin {
  const createTaskManager = dependencies.createTaskManager ?? createDefaultTaskManager;

  return {
    manifest: {
      apiVersion: RIVUS_PLUGIN_API_VERSION,
      id: 'agent-task-loop',
      version: '1.0.0',
    },
    register(registry: RivusPluginRegistry): void {
      for (const tool of taskManagerTools(createTaskManager)) {
        registry.registerTool(tool);
      }
      registry.registerAgentProfile({
        displayName: 'Task Manager',
        id: TASK_MANAGER_PROFILE_ID,
        memory: { scopes: [] },
        model: {},
        skills: { allow: [] },
        systemPrompt:
          'Manage tasks only through the declared agent-task-loop Tools. Treat Task Backend data as authoritative and never request Shell, filesystem, Endpoint, or credential access.',
        tools: { allow: TASK_MANAGER_TOOL_IDS },
      });
    },
  };
}

function taskManagerTools(
  createTaskManager: () => Promise<TaskManagerApplication>,
): RivusToolDescriptor[] {
  return [
    descriptor({
      createTaskManager,
      description: 'List a bounded set of tasks from configured Task Backends',
      digest: 'sha256:f385f1d5c6ac3179535503e8da6188ce87e44f32ce5a308aeb54ed8664951946',
      id: TASK_LIST_TOOL_ID,
      idempotency: 'supported',
      inputSchema: listTasksInputJsonSchema,
      parseInput: input => parseInput('task-list', listTasksInputSchema.safeParse(input)),
      risk: 'observe',
      run: (application, input) => application.listTasks(input),
    }),
    descriptor({
      createTaskManager,
      description: 'Get one task by its stable task id',
      digest: 'sha256:6fd7cf15bbea116a4fa3986e83cb8dc0d7757b8b395a64e1b049943f14992e73',
      id: TASK_GET_TOOL_ID,
      idempotency: 'supported',
      inputSchema: getTaskInputJsonSchema,
      parseInput: input => parseInput('task-get', getTaskInputSchema.safeParse(input)),
      risk: 'observe',
      run: (application, input) => application.getTask(input),
    }),
    descriptor({
      createTaskManager,
      description: 'Create one task in a configured Task Backend',
      digest: 'sha256:39b31c0c7edfbb73b1f8109dfceb1fe02f403bd5df9aeb0bc54e0880edbf39f3',
      id: TASK_CREATE_TOOL_ID,
      idempotency: 'none',
      inputSchema: createTaskInputJsonSchema,
      parseInput: input => parseInput('task-create', createTaskInputSchema.safeParse(input)),
      risk: 'mutate',
      run: (application, input) => application.createTask(input),
    }),
    descriptor({
      createTaskManager,
      description: 'Start or recover the execution and review workflow for one task',
      digest: 'sha256:94d3c0510b6589a93c50bc84bd1b67123732a7a4e72356bb11c879df2dbad538',
      id: TASK_START_TOOL_ID,
      idempotency: 'none',
      inputSchema: startTaskInputJsonSchema,
      parseInput: input => parseInput('task-start', startTaskInputSchema.safeParse(input)),
      risk: 'mutate',
      run: (application, input) => application.startTask(input),
    }),
  ];
}

function descriptor<TInput>(input: {
  createTaskManager: () => Promise<TaskManagerApplication>;
  description: string;
  digest: string;
  id: string;
  idempotency: RivusToolDescriptor['idempotency'];
  inputSchema: unknown;
  parseInput: (input: unknown) => TInput;
  risk: RivusToolDescriptor['risk'];
  run: (application: TaskManagerApplication, input: TInput) => Promise<unknown>;
}): RivusToolDescriptor {
  return {
    createExecutor: () => ({
      execute: async toolInput => {
        const parsedInput = input.parseInput(toolInput);
        try {
          const application = await input.createTaskManager();
          return await input.run(application, parsedInput);
        } catch (error) {
          if (error instanceof TaskManagerInputError) {
            throw new RivusToolInputRejected(error.message);
          }
          if (error instanceof TaskManagerOperationError) {
            throw error;
          }
          throw new TaskManagerOperationError('task-backend-failed', 'Task Manager operation failed');
        }
      },
    }),
    description: input.description,
    digest: input.digest,
    id: input.id,
    idempotency: input.idempotency,
    inputSchema: input.inputSchema,
    risk: input.risk,
    version: '1.0.0',
  };
}

function parseInput<T>(
  toolName: string,
  result: { success: true; data: T } | {
    success: false;
    error: { issues: Array<{ code: string; path: PropertyKey[] }> };
  },
): T {
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  const field = issue?.path.length
    ? issue.path.slice(0, 3).join('.').slice(0, 64)
    : 'input';
  throw new RivusToolInputRejected(
    `Invalid ${toolName} ${field}: ${inputRejectionReason(issue?.code)}`,
  );
}

function inputRejectionReason(code: string | undefined): string {
  switch (code) {
    case 'invalid_type':
      return 'has an invalid type';
    case 'invalid_enum_value':
      return 'has an unsupported value';
    case 'too_small':
      return 'is below its minimum length or value';
    case 'too_big':
      return 'exceeds its maximum length';
    case 'unrecognized_keys':
      return 'contains unknown properties';
    case 'invalid_string':
      return 'has an invalid format';
    default:
      return 'was rejected';
  }
}

async function createDefaultTaskManager(): Promise<TaskManagerApplication> {
  const { createConfiguredTaskManagerApplication } = await import('./task-manager/configured-task-manager');
  return createConfiguredTaskManagerApplication();
}

export default createRivusTaskManagerPlugin();
