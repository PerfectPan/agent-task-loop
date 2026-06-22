import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { defineCommand } from 'citty';
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

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
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

    let type = typeof args.type === 'string' ? args.type.trim().toLowerCase() : '';
    if (type !== 'github' && type !== 'feishu') {
      if (!isTty()) {
        console.error('Specify --type github|feishu.');
        process.exit(1);
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      type = (await prompt(rl, 'Source type? [g]ithub / [f]eishu: ')).trim().toLowerCase();
      rl.close();
      type = type === 'f' || type === 'feishu' ? 'feishu' : 'github';
    }

    let next: EditableConfig;
    if (type === 'github') {
      let owner = typeof args.owner === 'string' ? args.owner.trim() : '';
      let repo = typeof args.repo === 'string' ? args.repo.trim() : '';
      const defaultAgent = typeof args.agent === 'string' && args.agent.trim() ? args.agent.trim() : 'codex';
      if (!owner || !repo) {
        if (!isTty()) {
          console.error('GitHub source needs --owner and --repo.');
          process.exit(1);
        }
        const detected = detectRepo();
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        owner = owner || (await prompt(rl, `GitHub owner${detected ? ` [${detected.owner}]` : ''}: `)).trim() || detected?.owner || '';
        repo = repo || (await prompt(rl, `GitHub repo${detected ? ` [${detected.repo}]` : ''}: `)).trim() || detected?.repo || '';
        rl.close();
      }
      if (!owner || !repo) {
        console.error('GitHub owner and repo are required.');
        process.exit(1);
      }
      next = addGitHubRepo(config, { owner, repo, defaultAgent });
    } else {
      let baseToken = typeof args.token === 'string' ? args.token.trim() : '';
      let tableId = typeof args.table === 'string' ? args.table.trim() : '';
      if (!baseToken || !tableId) {
        if (!isTty()) {
          console.error('Feishu source needs --token and --table.');
          process.exit(1);
        }
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        baseToken = baseToken || (await prompt(rl, 'Feishu base token: ')).trim();
        tableId = tableId || (await prompt(rl, 'Feishu table id: ')).trim();
        rl.close();
      }
      if (!baseToken || !tableId) {
        console.error('Feishu base token and table id are required.');
        process.exit(1);
      }
      next = addFeishuSource(config, { baseToken, tableId });
    }

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
