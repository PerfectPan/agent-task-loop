import readline from 'node:readline';
import { defineCommand } from 'citty';
import { z } from 'zod';
import { loadConfig } from '../config/load-config';
import { listSources } from '../config/source-config';
import { TaskService } from '../services/task-service';
import type { CreateTaskPayload } from '../task-management/task-provider';
import { TARGET_AGENTS } from '../types/task';
import { printCommandOutput } from './command-output';

const agentSchema = z.enum(TARGET_AGENTS);
// `z.coerce.number()` alone turns "" into 0 (`Number("")` is 0) rather than
// failing; requiring a non-empty string first closes that gap.
const prioritySchema = z.string().min(1).pipe(z.coerce.number().int().min(0).max(9));

// Normalizes one raw CLI/prompt value into a trimmed, non-empty string (or
// undefined) — the shape every field starts from before shape validation.
const argSchema = z.preprocess(value => {
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

function parseArg(value: unknown): string | undefined {
  return argSchema.parse(value);
}

interface CreateInputs {
  taskId?: string;
  title?: string;
  project?: string;
  agent?: string;
  priority?: string;
  description?: string;
  source?: string;
}

type RequiredKey = 'taskId' | 'title' | 'project' | 'agent' | 'priority';

const FLAG_BY_KEY: Record<RequiredKey, string> = {
  taskId: '--task',
  title: '--title',
  project: '--project',
  agent: '--agent',
  priority: '--priority',
};

const QUESTION_BY_KEY: Record<RequiredKey, string> = {
  taskId: 'Task ID: ',
  title: 'Title: ',
  project: 'Project: ',
  agent: `Agent (${TARGET_AGENTS.join('/')}): `,
  priority: 'Priority (0-9): ',
};

// Presence-only shape (every required field just needs to be *some* string).
// Used solely to find which fields still need collecting before the fuller
// createInputsSchema below can run — interactive prompting needs that
// incrementally, one field at a time, not as a single pass/fail result.
const presenceSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  project: z.string(),
  agent: z.string(),
  priority: z.string(),
});

function missingKeys(inputs: CreateInputs): RequiredKey[] {
  const result = presenceSchema.safeParse(inputs);
  if (result.success) {
    return [];
  }
  return result.error.issues
    .filter(issue => issue.code === 'invalid_type' && issue.path.length === 1)
    .map(issue => issue.path[0] as RequiredKey);
}

function isTty(): boolean {
  return Boolean(process.stdin.isTTY);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function promptForMissing(inputs: CreateInputs): Promise<CreateInputs> {
  const missing = missingKeys(inputs);
  if (missing.length === 0) {
    return inputs;
  }

  if (!isTty()) {
    fail(`Missing required flag(s): ${missing.map(key => FLAG_BY_KEY[key]).join(', ')}`);
  }

  const next = { ...inputs };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const key of missing) {
      next[key] = parseArg(await question(rl, QUESTION_BY_KEY[key]));
    }
  } finally {
    rl.close();
  }
  return next;
}

const createInputsSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  project: z.string(),
  agent: agentSchema,
  priority: prioritySchema,
  description: z.string().optional(),
  source: z.string().optional(),
});

type ValidatedInputs = z.infer<typeof createInputsSchema>;

function formatIssue(issue: z.ZodIssue): string {
  const key = issue.path[0];
  const flag = typeof key === 'string' && key in FLAG_BY_KEY ? FLAG_BY_KEY[key as RequiredKey] : `--${String(key)}`;
  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    return `Missing required flag: ${flag}`;
  }
  return `Invalid ${flag}: ${issue.message}`;
}

function validateInputs(inputs: CreateInputs): ValidatedInputs {
  const result = createInputsSchema.safeParse(inputs);
  if (!result.success) {
    fail(result.error.issues.map(formatIssue).join('; '));
  }
  return result.data;
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
      taskId: parseArg(args.task),
      title: parseArg(args.title),
      project: parseArg(args.project),
      agent: parseArg(args.agent),
      priority: parseArg(args.priority),
      description: parseArg(args.description),
      source: parseArg(args.source),
    });
    const inputs = validateInputs(prompted);

    const config = await loadConfig(typeof args.config === 'string' ? args.config : undefined);
    const sourceSummaries = listSources(config);
    const sourceIds = sourceSummaries.map(source => source.id);
    const defaultSource = sourceSummaries.find(source => source.isDefault)?.id ?? sourceIds[0];
    const source = resolveSource(inputs.source, defaultSource ? [defaultSource, ...sourceIds.filter(id => id !== defaultSource)] : sourceIds);

    const payload: CreateTaskPayload = {
      taskId: inputs.taskId,
      title: inputs.title,
      project: inputs.project,
      targetAgent: inputs.agent,
      priority: inputs.priority,
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
