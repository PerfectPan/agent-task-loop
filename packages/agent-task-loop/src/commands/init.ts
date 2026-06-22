import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { defineCommand } from 'citty';
import { globalConfigPath } from '../config/load-config';

export { globalConfigPath };

const AGENT_MAP: Record<string, { name: string; command: string }> = {
  'claude-code': { name: 'claude', command: 'claude' },
  'codex': { name: 'codex', command: 'codex' },
};

type AgentEntry = { name: string; command: string; args: string[]; env: Record<string, string> };

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

export async function discoverRunnableAgents(): Promise<Record<string, AgentEntry>> {
  const { collectHostProbe, discover } = await import('@rivus/agent-finder-core');
  const probe = await collectHostProbe();
  const report = discover(probe);
  const agents: Record<string, AgentEntry> = {};
  for (const agent of report.agents) {
    if (agent.status === 'runnable' && AGENT_MAP[agent.id]) {
      const mapped = AGENT_MAP[agent.id];
      agents[mapped.name] = { name: mapped.name, command: mapped.command, args: [], env: {} };
    }
  }
  return agents;
}

export interface GlobalConfigInputs {
  feishu?: { baseToken: string; tableId: string };
  githubIssues?: { owner: string; repo: string; defaultAgent: string };
  agents: Record<string, AgentEntry>;
}

export function createGlobalConfig(inputs: GlobalConfigInputs): 'created' | 'exists' {
  const configPath = globalConfigPath();
  if (existsSync(configPath)) {
    return 'exists';
  }
  mkdirSync(path.dirname(configPath), { recursive: true });
  const config: Record<string, unknown> = {
    projects: {},
    repositories: {},
    agents: inputs.agents,
  };
  if (inputs.feishu) {
    config.feishu = inputs.feishu;
  }
  if (inputs.githubIssues) {
    config.githubIssues = inputs.githubIssues;
  }
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

/** Best-effort `gh repo view` lookup to prefill owner/repo. Returns undefined on any failure. */
function detectGitHubRepo(): { owner: string; repo: string } | undefined {
  try {
    const out = execFileSync('gh', ['repo', 'view', '--json', 'owner,name'], { encoding: 'utf8' });
    const parsed = JSON.parse(out) as { owner?: { login?: string }; name?: string };
    if (parsed.owner?.login && parsed.name) {
      return { owner: parsed.owner.login, repo: parsed.name };
    }
  } catch {
    // gh missing or not in a repo — fall through to manual entry.
  }
  return undefined;
}

async function ensureLarkCli(): Promise<boolean> {
  if (await isLarkCliAvailable()) {
    return true;
  }
  console.log('lark-cli is not found on PATH.');
  const shouldInstall = await confirmInstall();
  if (!shouldInstall) {
    console.log('Install it with: npm install -g @larksuite/cli');
    console.log('Then re-run `agent-task-loop init`.');
    return false;
  }
  console.log('Installing @larksuite/cli...');
  execFileSync('npm', ['install', '-g', '@larksuite/cli'], { stdio: 'inherit' });
  if (!await isLarkCliAvailable()) {
    console.error('Installation failed. Install manually: npm install -g @larksuite/cli');
    return false;
  }
  console.log('lark-cli installed successfully.');
  return true;
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Create a global config at ~/.agent-task-loop/config.json',
  },
  async run() {
    const configPath = globalConfigPath();
    if (existsSync(configPath)) {
      console.log(`Global config already exists at: ${configPath}`);
      console.log('Use `agent-task-loop source add` to add a task source, or edit the file directly.');
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const sourceAnswer = (await prompt(rl, 'Which task source? [g]ithub / [f]eishu / [b]oth (default: github): '))
      .trim()
      .toLowerCase();
    const useFeishu = sourceAnswer === 'f' || sourceAnswer === 'feishu' || sourceAnswer === 'b' || sourceAnswer === 'both';
    const useGitHub =
      sourceAnswer === '' ||
      sourceAnswer === 'g' ||
      sourceAnswer === 'github' ||
      sourceAnswer === 'b' ||
      sourceAnswer === 'both';

    if (!useGitHub && !useFeishu) {
      rl.close();
      console.error('Unknown source. Choose github, feishu, or both. Re-run `agent-task-loop init`.');
      process.exit(1);
    }

    let githubIssues: GlobalConfigInputs['githubIssues'];
    if (useGitHub) {
      const detected = detectGitHubRepo();
      const ownerPrompt = detected ? `GitHub owner [${detected.owner}]: ` : 'GitHub owner: ';
      const repoPrompt = detected ? `GitHub repo [${detected.repo}]: ` : 'GitHub repo: ';
      const owner = (await prompt(rl, ownerPrompt)).trim() || detected?.owner || '';
      const repo = (await prompt(rl, repoPrompt)).trim() || detected?.repo || '';
      const defaultAgent = (await prompt(rl, 'Default agent for issues without an agent label [codex]: ')).trim() || 'codex';
      if (!owner || !repo) {
        rl.close();
        console.error('GitHub owner and repo are required. Re-run `agent-task-loop init`.');
        process.exit(1);
      }
      githubIssues = { owner, repo, defaultAgent };
    }

    let feishu: GlobalConfigInputs['feishu'];
    if (useFeishu) {
      rl.close();
      if (!(await ensureLarkCli())) {
        process.exit(1);
      }
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      const baseToken = (await prompt(rl2, 'Feishu base token: ')).trim();
      const tableId = (await prompt(rl2, 'Feishu table ID: ')).trim();
      rl2.close();
      feishu = { baseToken, tableId };
    } else {
      rl.close();
    }

    const agents = await discoverRunnableAgents();
    const agentNames = Object.keys(agents);
    if (agentNames.length > 0) {
      console.log(`Found agents: ${agentNames.join(', ')}`);
    } else {
      console.log('Warning: no supported agents found on PATH. You can add them manually later.');
    }

    createGlobalConfig({ feishu, githubIssues, agents });
    console.log(`Global config written to: ${configPath}`);
  },
});
