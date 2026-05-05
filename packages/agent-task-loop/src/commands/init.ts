import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { defineCommand } from 'citty';

const AGENT_MAP: Record<string, { name: string; command: string }> = {
  'claude-code': { name: 'claude', command: 'claude' },
  'codex': { name: 'codex', command: 'codex' },
};

export async function isLarkCliAvailable(): Promise<boolean> {
  const { resolveCommand } = await import('@rivus/agent-finder-core');
  return (
    resolveCommand('lark-cli', {
      path: process.env.PATH ?? '',
      pathExt: process.env.PATHEXT,
      delimiter: process.platform === 'win32' ? ';' : ':',
      fileExists: existsSync,
    }) !== null
  );
}

export async function discoverRunnableAgents(): Promise<Record<string, { name: string; command: string; args: string[]; env: Record<string, string> }>> {
  const { collectHostProbe, discover } = await import('@rivus/agent-finder-core');
  const probe = await collectHostProbe();
  const report = discover(probe);
  const agents: Record<string, { name: string; command: string; args: string[]; env: Record<string, string> }> = {};
  for (const agent of report.agents) {
    if (agent.status === 'runnable' && AGENT_MAP[agent.id]) {
      const mapped = AGENT_MAP[agent.id];
      agents[mapped.name] = { name: mapped.name, command: mapped.command, args: [], env: {} };
    }
  }
  return agents;
}

export interface GlobalConfigInputs {
  baseToken: string;
  tableId: string;
  agents: Record<string, { name: string; command: string; args: string[]; env: Record<string, string> }>;
}

export function globalConfigPath(): string {
  return path.join(os.homedir(), '.agent-task-loop', 'config.json');
}

export function createGlobalConfig(inputs: GlobalConfigInputs): 'created' | 'exists' {
  const configPath = globalConfigPath();
  if (existsSync(configPath)) {
    return 'exists';
  }
  mkdirSync(path.dirname(configPath), { recursive: true });
  const config = {
    feishu: { baseToken: inputs.baseToken, tableId: inputs.tableId },
    projects: {},
    repositories: {},
    agents: inputs.agents,
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return 'created';
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

async function confirmInstall(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt(rl, 'Install @larksuite/cli globally now? [y/N] ');
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Create a global config at ~/.agent-task-loop/config.json',
  },
  async run() {
    if (!await isLarkCliAvailable()) {
      console.log('lark-cli is not found on PATH.');
      const shouldInstall = await confirmInstall();
      if (!shouldInstall) {
        console.log('Install it with: npm install -g @larksuite/cli');
        console.log('Then re-run `agent-task-loop init`.');
        process.exit(1);
      }
      console.log('Installing @larksuite/cli...');
      execFileSync('npm', ['install', '-g', '@larksuite/cli'], { stdio: 'inherit' });
      if (!await isLarkCliAvailable()) {
        console.error('Installation failed. Install manually: npm install -g @larksuite/cli');
        process.exit(1);
      }
      console.log('lark-cli installed successfully.');
    }

    const configPath = globalConfigPath();
    if (existsSync(configPath)) {
      console.log(`Global config already exists at: ${configPath}`);
      return;
    }

    const agents = await discoverRunnableAgents();
    const agentNames = Object.keys(agents);
    if (agentNames.length > 0) {
      console.log(`Found agents: ${agentNames.join(', ')}`);
    } else {
      console.log('Warning: no supported agents found on PATH. You can add them manually later.');
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const baseToken = await prompt(rl, 'Feishu base token: ');
    const tableId = await prompt(rl, 'Feishu table ID: ');
    rl.close();

    createGlobalConfig({ baseToken: baseToken.trim(), tableId: tableId.trim(), agents });
    console.log(`Global config written to: ${configPath}`);
  },
});
