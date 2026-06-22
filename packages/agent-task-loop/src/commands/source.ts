import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { defineCommand } from 'citty';
import { z } from 'zod';
import { globalConfigPath } from '../config/load-config';
import { appConfigSchema } from '../config/schema';
import {
  addFeishuSource,
  addGitHubRepo,
  listSources,
  removeSource,
  type EditableConfig,
} from '../config/source-config';

function resolvePath(configArg: unknown): string {
  return typeof configArg === 'string' && configArg.length > 0
    ? path.resolve(process.cwd(), configArg)
    : globalConfigPath();
}

function readConfig(file: string): EditableConfig {
  if (!existsSync(file)) {
    return { projects: {}, repositories: {}, agents: {} };
  }
  return JSON.parse(readFileSync(file, 'utf8')) as EditableConfig;
}

function writeConfig(file: string, config: EditableConfig): void {
  // Validate the merged result before persisting (catches an invalid state).
  appConfigSchema.parse(config);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
}

function printSources(config: EditableConfig): void {
  const sources = listSources(config);
  if (sources.length === 0) {
    console.log('No sources configured.');
    return;
  }
  console.log('Sources:');
  for (const source of sources) {
    console.log(`  ${source.isDefault ? '*' : ' '} ${source.id}`);
  }
}

/** One-shot interactive prompt: opens a readline, asks, returns the trimmed answer. */
async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>(resolve => rl.question(question, resolve));
    return answer.trim();
  } finally {
    rl.close();
  }
}

/** Best-effort `gh repo view` to prefill owner/repo. */
function detectRepo(): { owner: string; repo: string } | undefined {
  try {
    const out = execFileSync('gh', ['repo', 'view', '--json', 'owner,name'], { encoding: 'utf8' });
    const parsed = JSON.parse(out) as { owner?: { login?: string }; name?: string };
    if (parsed.owner?.login && parsed.name) {
      return { owner: parsed.owner.login, repo: parsed.name };
    }
  } catch {
    // gh missing / not in a repo
  }
  return undefined;
}

const isTty = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** A CLI flag that must resolve to a non-empty trimmed string, with a clear message. */
const requiredFlag = (message: string) =>
  z.preprocess(value => (typeof value === 'string' ? value : ''), z.string().trim().min(1, message));

/** Validates the resolved `source add` inputs by type. Coercion, trimming and
 *  per-type required-ness all live here instead of hand-rolled checks. */
const addSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('github'),
    owner: requiredFlag('GitHub owner is required (--owner).'),
    repo: requiredFlag('GitHub repo is required (--repo).'),
    agent: z.preprocess(
      value => (typeof value === 'string' && value.trim() ? value.trim() : 'codex'),
      z.enum(['claude', 'codex', 'coco', 'glm']),
    ),
  }),
  z.object({
    type: z.literal('feishu'),
    token: requiredFlag('Feishu base token is required (--token).'),
    table: requiredFlag('Feishu table id is required (--table).'),
  }),
]);

function failValidation(error: z.ZodError): never {
  console.error(error.issues.map(issue => issue.message).join('\n'));
  process.exit(1);
}

export const sourceListCommand = defineCommand({
  meta: { name: 'list', description: 'List configured task sources' },
  args: { config: { type: 'string' } },
  run({ args }) {
    const file = resolvePath(args.config);
    if (!existsSync(file)) {
      console.log('No config found. Run `agent-task-loop source add` to create one.');
      return;
    }
    printSources(readConfig(file));
  },
});

export const sourceAddCommand = defineCommand({
  meta: { name: 'add', description: 'Add a task source (GitHub repo or Feishu Base) to the config' },
  args: {
    type: { type: 'string', description: 'github | feishu' },
    owner: { type: 'string', description: 'GitHub owner' },
    repo: { type: 'string', description: 'GitHub repo' },
    agent: { type: 'string', description: 'Default agent for the GitHub source (default: codex)' },
    token: { type: 'string', description: 'Feishu base token' },
    table: { type: 'string', description: 'Feishu table id' },
    config: { type: 'string' },
  },
  async run({ args }) {
    const file = resolvePath(args.config);
    const config = readConfig(file);

    // Resolve the source type (flag → prompt). zod validates the rest.
    let type = typeof args.type === 'string' ? args.type.trim().toLowerCase() : '';
    if (type !== 'github' && type !== 'feishu') {
      if (!isTty()) {
        console.error('Specify --type github|feishu.');
        process.exit(1);
      }
      const answer = (await ask('Source type? [g]ithub / [f]eishu: ')).trim().toLowerCase();
      type = answer === 'f' || answer === 'feishu' ? 'feishu' : 'github';
    }

    // Gather raw inputs, prompting (TTY only) for anything a flag didn't supply.
    const raw: Record<string, unknown> = { type, agent: args.agent };
    if (type === 'github') {
      raw.owner = args.owner;
      raw.repo = args.repo;
      if ((!raw.owner || !raw.repo) && isTty()) {
        const detected = detectRepo();
        raw.owner = raw.owner || (await ask(`GitHub owner${detected ? ` [${detected.owner}]` : ''}: `)) || detected?.owner;
        raw.repo = raw.repo || (await ask(`GitHub repo${detected ? ` [${detected.repo}]` : ''}: `)) || detected?.repo;
      }
    } else {
      raw.token = args.token;
      raw.table = args.table;
      if ((!raw.token || !raw.table) && isTty()) {
        raw.token = raw.token || (await ask('Feishu base token: '));
        raw.table = raw.table || (await ask('Feishu table id: '));
      }
    }

    const parsed = addSourceSchema.safeParse(raw);
    if (!parsed.success) {
      failValidation(parsed.error);
    }

    const next =
      parsed.data.type === 'github'
        ? addGitHubRepo(config, { owner: parsed.data.owner, repo: parsed.data.repo, defaultAgent: parsed.data.agent })
        : addFeishuSource(config, { baseToken: parsed.data.token, tableId: parsed.data.table });

    writeConfig(file, next);
    console.log(`Updated ${file}`);
    printSources(next);
  },
});

export const sourceRemoveCommand = defineCommand({
  meta: { name: 'remove', description: "Remove a task source by id ('feishu' or 'github:<owner>/<repo>')" },
  args: {
    id: { type: 'positional', required: true, description: "feishu | github:<owner>/<repo>" },
    config: { type: 'string' },
  },
  run({ args }) {
    const file = resolvePath(args.config);
    if (!existsSync(file)) {
      console.error('No config found.');
      process.exit(1);
    }
    const next = removeSource(readConfig(file), String(args.id));
    writeConfig(file, next);
    console.log(`Updated ${file}`);
    printSources(next);
  },
});

export const sourceCommand = defineCommand({
  meta: { name: 'source', description: 'Manage task sources (list / add / remove)' },
  subCommands: {
    list: sourceListCommand,
    add: sourceAddCommand,
    remove: sourceRemoveCommand,
  },
});
