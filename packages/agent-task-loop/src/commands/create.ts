import readline from 'node:readline';
import { defineCommand } from 'citty';
import { loadConfig } from '../config/load-config';
import { listSources } from '../config/source-config';
import { TaskService } from '../services/task-service';
import type { CreateTaskPayload } from '../task-management/task-provider';
import { TARGET_AGENTS, type TargetAgent } from '../types/task';
import { printCommandOutput } from './command-output';

interface CreateInputs {
  taskId?: string;
  title?: string;
  project?: string;
  agent?: string;
  priority?: string;
  description?: string;
  source?: string;
}

type RequiredInput = 'taskId' | 'title' | 'project' | 'agent' | 'priority';

const REQUIRED_INPUTS: Array<{ key: RequiredInput; flag: string; question: string }> = [
  { key: 'taskId', flag: '--task', question: 'Task ID: ' },
  { key: 'title', flag: '--title', question: 'Title: ' },
  { key: 'project', flag: '--project', question: 'Project: ' },
  { key: 'agent', flag: '--agent', question: `Agent (${TARGET_AGENTS.join('/')}): ` },
  { key: 'priority', flag: '--priority', question: 'Priority (0-9): ' },
];

function isTty(): boolean {
  return Boolean(process.stdin.isTTY);
}

function stringArg(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalStringArg(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function missingRequired(inputs: CreateInputs): typeof REQUIRED_INPUTS {
  return REQUIRED_INPUTS.filter(input => !inputs[input.key]);
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function promptForMissing(inputs: CreateInputs): Promise<CreateInputs> {
  const missing = missingRequired(inputs);
  if (missing.length === 0) {
    return inputs;
  }

  if (!isTty()) {
    fail(`Missing required flag(s): ${missing.map(input => input.flag).join(', ')}`);
  }

  const next = { ...inputs };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const input of missing) {
      next[input.key] = (await question(rl, input.question)).trim();
    }
  } finally {
    rl.close();
  }
  return next;
}

function parseAgent(agent: string): TargetAgent {
  if (TARGET_AGENTS.includes(agent as TargetAgent)) {
    return agent as TargetAgent;
  }
  fail(`Invalid --agent "${agent}" (expected claude, codex, coco, or glm).`);
}

function parsePriority(priority: string): number {
  if (/^[0-9]$/.test(priority)) {
    return Number(priority);
  }
  fail(`Invalid --priority "${priority}" (expected an integer from 0 to 9).`);
}

function validateRequired(inputs: CreateInputs): Required<CreateInputs> {
  const missing = missingRequired(inputs);
  if (missing.length > 0) {
    fail(`Missing required flag(s): ${missing.map(input => input.flag).join(', ')}`);
  }
  return inputs as Required<CreateInputs>;
}

function expectedSourcesMessage(sources: readonly string[]): string {
  return sources.length > 0 ? sources.join(', ') : 'a configured source';
}

function resolveSource(
  requestedSource: string | undefined,
  sourceIds: readonly string[],
): { payloadSource?: string; outputSource: string } {
  const defaultSource = sourceIds[0];
  if (!defaultSource) {
    fail('No task sources configured.');
  }

  if (requestedSource) {
    if (!sourceIds.includes(requestedSource)) {
      fail(`Invalid --source "${requestedSource}" (expected ${expectedSourcesMessage(sourceIds)}).`);
    }
    return { payloadSource: requestedSource, outputSource: requestedSource };
  }

  return { outputSource: defaultSource };
}

export const createCommand = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a task in a configured task source',
  },
  args: {
    task: {
      type: 'string',
      description: 'Task id, e.g. TASK-101',
    },
    title: {
      type: 'string',
      description: 'Task title',
    },
    project: {
      type: 'string',
      description: 'Project key/name',
    },
    agent: {
      type: 'string',
      description: 'Target agent (claude|codex|coco|glm)',
    },
    priority: {
      type: 'string',
      description: 'Priority from 0 to 9',
    },
    description: {
      type: 'string',
      description: 'Task description',
    },
    source: {
      type: 'string',
      description: 'Task source id (feishu or github:<owner>/<repo>)',
    },
    config: {
      type: 'string',
    },
    json: {
      type: 'boolean',
      default: false,
    },
  },
  async run({ args }) {
    const prompted = await promptForMissing({
      taskId: stringArg(args.task),
      title: stringArg(args.title),
      project: stringArg(args.project),
      agent: stringArg(args.agent),
      priority: stringArg(args.priority),
      description: optionalStringArg(args.description),
      source: optionalStringArg(args.source),
    });
    const inputs = validateRequired(prompted);
    const targetAgent = parseAgent(inputs.agent);
    const priority = parsePriority(inputs.priority);

    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    const sourceSummaries = listSources(config);
    const sourceIds = sourceSummaries.map(source => source.id);
    const defaultSource = sourceSummaries.find(source => source.isDefault)?.id ?? sourceIds[0];
    const source = resolveSource(inputs.source, defaultSource ? [defaultSource, ...sourceIds.filter(id => id !== defaultSource)] : sourceIds);

    const payload: CreateTaskPayload = {
      taskId: inputs.taskId,
      title: inputs.title,
      project: inputs.project,
      targetAgent,
      priority,
      ...(inputs.description ? { description: inputs.description } : {}),
      ...(source.payloadSource ? { source: source.payloadSource } : {}),
    };

    const service = new TaskService(config);
    await service.createTask(payload);

    printCommandOutput({
      json: Boolean(args.json),
      jsonValue: { taskId: inputs.taskId, source: source.outputSource },
      textLines: [`Created task ${inputs.taskId} in ${source.outputSource}`],
    });
  },
});
