# Global Config & Init Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend config resolution to support `task.config.json` and a global `~/.agent-task-loop/config.json` fallback, and add an interactive `init` command that detects `lark-cli`, discovers available agents via `@rivus/agent-finder-core`, prompts for Feishu credentials, and writes the global config.

**Architecture:** Modify `resolveConfigPath` to walk the new candidate list and fall back to global JSON; add a JSON loader path in `loadConfig`; add `@rivus/agent-finder-core` workspace dependency; implement `init` with a pure testable core (`createGlobalConfig(inputs)`) and a thin interactive shell (`initCommand`) that collects inputs via `readline`.

**Tech Stack:** Node.js ≥20 ESM, TypeScript, Zod, Vitest, `citty`, `@rivus/agent-finder-core` (workspace).

---

## Background

RFC 0003 (`rfcs/0003-global-config-init.md`) specifies:

1. **Config resolution order** (first match wins):
   1. `--config` flag
   2. `AGENT_TASK_LOOP_CONFIG` env var
   3. Walk up from cwd: `task.config.ts`, `.mts`, `.js`, `.mjs`, `task.config.json`
   4. Global: `~/.agent-task-loop/config.json`

2. **JSON loading** – JSON configs use `readFileSync` + `JSON.parse`, not dynamic `import()`.

3. **`init` command** – interactive setup:
   - Detects `lark-cli` on PATH via `resolveCommand` from `@rivus/agent-finder-core`; exits with instructions if missing
   - Skips if `~/.agent-task-loop/config.json` already exists
   - Calls `collectHostProbe()` + `discover()` from `@rivus/agent-finder-core`; maps `claude-code → claude` and `codex → codex` for `status: 'runnable'` entries
   - Prompts for Feishu `baseToken` and `tableId` via Node's `readline`
   - Writes the config with discovered agents pre-populated

**Key files:**
- Modify: `packages/agent-task-loop/src/config/load-config.ts`
- Modify: `packages/agent-task-loop/package.json`
- Create: `packages/agent-task-loop/src/commands/init.ts`
- Modify: `packages/agent-task-loop/src/cli.ts`
- Modify: `packages/agent-task-loop/tests/config/load-config.test.ts`
- Create: `packages/agent-task-loop/tests/commands/init.test.ts`

**Run tests:** `pnpm test` from `packages/agent-task-loop/`

---

### Task 1: Support `task.config.json` and global config fallback in `load-config.ts`

**Files:**
- Modify: `packages/agent-task-loop/src/config/load-config.ts`
- Modify: `packages/agent-task-loop/tests/config/load-config.test.ts`

**Step 1: Write failing tests**

Add to `tests/config/load-config.test.ts` inside the existing `describe('loadConfig', ...)` block. First update the import line at the top:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, resolveConfigPath } from '../../src/config/load-config';
```

Add this test after the existing ones:

```ts
it('resolves task.config.json from the current working directory', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-json-'));
  const configPath = path.join(tempDir, 'task.config.json');

  await writeFile(
    configPath,
    JSON.stringify({
      feishu: { baseToken: 'json-base', tableId: 'json-table' },
      projects: {
        demo: { key: 'demo', name: 'JsonDemo', defaultRepository: 'demo_repo', workspaceRoot: '/tmp/demo', taskTemplatePrompt: 'hi' },
      },
      repositories: {
        demo_repo: { key: 'demo_repo', localPath: '/tmp/demo', defaultBranch: 'main', installCommand: 'pnpm install', testCommand: 'pnpm test', buildCommand: 'pnpm build', workspaceStrategy: 'worktree' },
      },
      agents: {
        claude: { name: 'claude', command: 'claude', args: [], env: {} },
        codex: { name: 'codex', command: 'codex', args: [], env: {} },
        coco: { name: 'coco', command: 'coco', args: [], env: {} },
        glm: { name: 'glm', command: 'glm', args: [], env: {} },
      },
    }),
    'utf8',
  );

  process.chdir(tempDir);

  try {
    expect(resolveConfigPath().endsWith('/task.config.json')).toBe(true);
    const config = await loadConfig();
    expect(config.feishu.baseToken).toBe('json-base');
    expect(config.projects.demo.name).toBe('JsonDemo');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
```

Also add a `describe` block for global config fallback tests (these will fail until Task 1 is implemented):

```ts
describe('global config fallback', () => {
  const originalHome = os.homedir;
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-home-'));
    (os as unknown as { homedir: () => string }).homedir = () => fakeHome;
  });

  afterEach(async () => {
    (os as unknown as { homedir: () => string }).homedir = originalHome;
    await rm(fakeHome, { recursive: true, force: true });
  });

  it('falls back to global config when no project config exists', async () => {
    const globalDir = path.join(fakeHome, '.agent-task-loop');
    await mkdir(globalDir, { recursive: true });
    const globalConfigPath = path.join(globalDir, 'config.json');
    await writeFile(
      globalConfigPath,
      JSON.stringify({
        feishu: { baseToken: 'global-base', tableId: 'global-table' },
        projects: {},
        repositories: {},
        agents: { claude: { name: 'claude', command: 'claude', args: [], env: {} } },
      }),
      'utf8',
    );

    const emptyDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-empty-'));
    process.chdir(emptyDir);

    try {
      expect(resolveConfigPath()).toBe(globalConfigPath);
      const config = await loadConfig();
      expect(config.feishu.baseToken).toBe('global-base');
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('project config takes precedence over global config', async () => {
    const globalDir = path.join(fakeHome, '.agent-task-loop');
    await mkdir(globalDir, { recursive: true });
    await writeFile(
      path.join(globalDir, 'config.json'),
      JSON.stringify({
        feishu: { baseToken: 'global-base', tableId: 'global-table' },
        projects: {},
        repositories: {},
        agents: { claude: { name: 'claude', command: 'claude', args: [], env: {} } },
      }),
      'utf8',
    );

    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-project-'));
    await writeFile(
      path.join(projectDir, 'task.config.json'),
      JSON.stringify({
        feishu: { baseToken: 'project-base', tableId: 'project-table' },
        projects: {},
        repositories: {},
        agents: { claude: { name: 'claude', command: 'claude', args: [], env: {} } },
      }),
      'utf8',
    );

    process.chdir(projectDir);

    try {
      const config = await loadConfig();
      expect(config.feishu.baseToken).toBe('project-base');
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test tests/config/load-config.test.ts
```

Expected: FAIL on `task.config.json` test and both global config tests.

**Step 3: Implement the changes in `load-config.ts`**

Replace the entire file with:

```ts
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AppConfig } from './schema';
import { appConfigSchema } from './schema';

const defaultConfigFilenames = [
  'task.config.ts',
  'task.config.mts',
  'task.config.js',
  'task.config.mjs',
  'task.config.json',
];

function* walkUpDirectories(start: string): Generator<string> {
  let current = path.resolve(start);
  while (true) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function resolveConfigPath(configPath?: string): string {
  if (configPath) {
    const explicitPath = path.resolve(process.cwd(), configPath);
    if (!existsSync(explicitPath)) {
      throw new Error(`Config file not found: ${explicitPath}`);
    }
    return explicitPath;
  }

  const candidates: string[] = [];

  const envConfig = process.env.AGENT_TASK_LOOP_CONFIG;
  if (envConfig) {
    candidates.push(path.resolve(process.cwd(), envConfig));
  }

  for (const directory of walkUpDirectories(process.cwd())) {
    for (const filename of defaultConfigFilenames) {
      candidates.push(path.join(directory, filename));
    }
  }

  candidates.push(path.join(os.homedir(), '.agent-task-loop', 'config.json'));

  const resolved = candidates.find(candidate => existsSync(candidate));
  if (!resolved) {
    throw new Error(
      'No task config found. Run `agent-task-loop init` to create a global config, or pass --config / set AGENT_TASK_LOOP_CONFIG.',
    );
  }

  return resolved;
}

async function loadConfigFromPath(resolvedPath: string): Promise<AppConfig> {
  if (resolvedPath.endsWith('.json')) {
    const raw = JSON.parse(readFileSync(resolvedPath, 'utf8'));
    return appConfigSchema.parse(raw);
  }
  const mod = await import(pathToFileURL(resolvedPath).href);
  const raw = mod.default ?? mod.config;
  return appConfigSchema.parse(raw);
}

export async function loadConfig(configPath?: string): Promise<AppConfig> {
  const resolvedPath = resolveConfigPath(configPath);
  return loadConfigFromPath(resolvedPath);
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test tests/config/load-config.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add packages/agent-task-loop/src/config/load-config.ts packages/agent-task-loop/tests/config/load-config.test.ts
git commit -m "feat(config): support task.config.json and global ~/.agent-task-loop/config.json fallback"
```

---

### Task 2: Add `@rivus/agent-finder-core` workspace dependency

**Files:**
- Modify: `packages/agent-task-loop/package.json`

**Step 1: Add the dependency**

Add to the `"dependencies"` block in `packages/agent-task-loop/package.json`:

```json
"@rivus/agent-finder-core": "workspace:*"
```

**Step 2: Install**

```bash
pnpm install
```

Expected: Lock file updated, `@rivus/agent-finder-core` resolvable from `packages/agent-task-loop`.

**Step 3: Verify the package resolves**

```bash
node -e "import('@rivus/agent-finder-core').then(m => console.log(Object.keys(m)))" --input-type=module
```

Expected: Prints the exported names including `discover`, `collectHostProbe`, `resolveCommand`.

**Step 4: Commit**

```bash
git add packages/agent-task-loop/package.json pnpm-lock.yaml
git commit -m "feat(init): add @rivus/agent-finder-core workspace dependency"
```

---

### Task 3: Implement the `init` command

**Files:**
- Create: `packages/agent-task-loop/src/commands/init.ts`
- Create: `packages/agent-task-loop/tests/commands/init.test.ts`

**Step 1: Write the failing tests**

Create `packages/agent-task-loop/tests/commands/init.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGlobalConfig, isLarkCliAvailable } from '../../src/commands/init';

// Stub agent discovery so tests don't hit the real host
vi.mock('@rivus/agent-finder-core', () => ({
  resolveCommand: vi.fn(),
  collectHostProbe: vi.fn(() => ({})),
  discover: vi.fn(() => ({
    schema_version: '0.1',
    generated_at: '',
    host: { os: 'linux', arch: 'x64' },
    agents: [
      { id: 'claude-code', status: 'runnable', command: '/usr/bin/claude', name: 'Claude Code', type: 'cli', app_path: null, version: null, evidence: [], config_paths: [], mcp_config_paths: [], warnings: [] },
      { id: 'codex', status: 'missing', command: null, name: 'Codex', type: 'cli', app_path: null, version: null, evidence: [], config_paths: [], mcp_config_paths: [], warnings: [] },
    ],
  })),
}));

describe('isLarkCliAvailable', () => {
  it('returns true when resolveCommand finds lark-cli', async () => {
    const { resolveCommand } = await import('@rivus/agent-finder-core');
    vi.mocked(resolveCommand).mockReturnValue('/usr/bin/lark-cli');
    expect(isLarkCliAvailable()).toBe(true);
  });

  it('returns false when resolveCommand returns null', async () => {
    const { resolveCommand } = await import('@rivus/agent-finder-core');
    vi.mocked(resolveCommand).mockReturnValue(null);
    expect(isLarkCliAvailable()).toBe(false);
  });
});

describe('createGlobalConfig', () => {
  const originalHome = os.homedir;
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-init-'));
    (os as unknown as { homedir: () => string }).homedir = () => fakeHome;
  });

  afterEach(async () => {
    (os as unknown as { homedir: () => string }).homedir = originalHome;
    await rm(fakeHome, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('writes config.json with entered credentials and discovered agents', async () => {
    await createGlobalConfig({ baseToken: 'my-token', tableId: 'my-table' });

    const configPath = path.join(fakeHome, '.agent-task-loop', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const parsed = JSON.parse(await readFile(configPath, 'utf8'));
    expect(parsed.feishu.baseToken).toBe('my-token');
    expect(parsed.feishu.tableId).toBe('my-table');
    // only claude-code (status: 'runnable') should appear; codex (missing) should not
    expect(parsed.agents).toHaveProperty('claude');
    expect(parsed.agents).not.toHaveProperty('codex');
    expect(parsed.projects).toEqual({});
    expect(parsed.repositories).toEqual({});
  });

  it('does not overwrite an existing config', async () => {
    const globalDir = path.join(fakeHome, '.agent-task-loop');
    await mkdir(globalDir, { recursive: true });
    const configPath = path.join(globalDir, 'config.json');
    const existing = JSON.stringify({ feishu: { baseToken: 'existing', tableId: 'existing-table' } });
    await writeFile(configPath, existing, 'utf8');

    const result = await createGlobalConfig({ baseToken: 'new', tableId: 'new' });

    expect(result).toBe('exists');
    expect(await readFile(configPath, 'utf8')).toBe(existing);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test tests/commands/init.test.ts
```

Expected: FAIL – `createGlobalConfig` and `isLarkCliAvailable` do not exist.

**Step 3: Implement `init.ts`**

Create `packages/agent-task-loop/src/commands/init.ts`:

```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { delimiter } from 'node:path';
import readline from 'node:readline';
import { collectHostProbe, discover, resolveCommand } from '@rivus/agent-finder-core';
import { defineCommand } from 'citty';

const AGENT_MAP: Record<string, { name: 'claude' | 'codex' | 'coco' | 'glm'; command: string }> = {
  'claude-code': { name: 'claude', command: 'claude' },
  'codex': { name: 'codex', command: 'codex' },
};

export function isLarkCliAvailable(): boolean {
  return resolveCommand('lark-cli', {
    path: process.env.PATH ?? '',
    pathExt: process.env.PATHEXT,
    delimiter,
    fileExists: existsSync,
  }) !== null;
}

function discoverAgents(): Record<string, { name: string; command: string; args: string[]; env: Record<string, string> }> {
  const probe = collectHostProbe();
  const report = discover(probe);
  const agents: Record<string, { name: string; command: string; args: string[]; env: Record<string, string> }> = {};

  for (const agent of report.agents) {
    const mapping = AGENT_MAP[agent.id];
    if (mapping && agent.status === 'runnable') {
      agents[mapping.name] = { name: mapping.name, command: mapping.command, args: [], env: {} };
    }
  }

  return agents;
}

export async function createGlobalConfig(
  inputs: { baseToken: string; tableId: string },
): Promise<'created' | 'exists'> {
  const globalDir = path.join(os.homedir(), '.agent-task-loop');
  const configPath = path.join(globalDir, 'config.json');

  if (existsSync(configPath)) {
    return 'exists';
  }

  const agents = discoverAgents();

  mkdirSync(globalDir, { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        feishu: { baseToken: inputs.baseToken, tableId: inputs.tableId },
        projects: {},
        repositories: {},
        agents,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return 'created';
}

async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Interactive first-run setup: detect lark-cli, discover agents, configure Feishu',
  },
  async run() {
    if (!isLarkCliAvailable()) {
      console.log('lark-cli is required but not found on PATH.');
      console.log('Install command: npm install -g @larksuite/cli');
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await prompt(rl2, 'Install it now? [Y/n]: ');
      rl2.close();
      if (answer.toLowerCase() === 'n') {
        console.log('Re-run `agent-task-loop init` after installing lark-cli.');
        process.exit(1);
      }
      const { execa } = await import('execa');
      await execa('npm', ['install', '-g', '@larksuite/cli'], { stdio: 'inherit' });
      console.log('lark-cli installed. Note: run `lark-cli config init` and `lark-cli auth login` to authenticate.');
    }

    const configPath = path.join(os.homedir(), '.agent-task-loop', 'config.json');
    if (existsSync(configPath)) {
      console.log(`Global config already exists: ${configPath}`);
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const baseToken = await prompt(rl, 'Feishu base token: ');
    const tableId = await prompt(rl, 'Feishu table ID: ');
    rl.close();

    const result = await createGlobalConfig({ baseToken, tableId });
    if (result === 'created') {
      console.log(`Created global config: ${configPath}`);
    }
  },
});
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test tests/commands/init.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add packages/agent-task-loop/src/commands/init.ts packages/agent-task-loop/tests/commands/init.test.ts
git commit -m "feat(init): interactive init with lark-cli detection and agent-finder discovery"
```

---

### Task 4: Register `init` in the CLI

**Files:**
- Modify: `packages/agent-task-loop/src/cli.ts`

**Step 1: Add import and register subcommand**

Add the import after the existing command imports:

```ts
import { initCommand } from './commands/init';
```

Add `init: initCommand` to `subCommands` (keep alphabetical order):

```ts
subCommands: {
  cleanup: cleanupCommand,
  complete: completeCommand,
  init: initCommand,
  reject: rejectCommand,
  resume: resumeCommand,
  run: runCommand,
  schema: schemaCommand,
  start: startCommand,
  sync: syncCommand,
  tui: tuiCommand,
  watch: watchCommand,
},
```

**Step 2: Run full test suite**

```bash
pnpm test
```

Expected: All PASS, no regressions.

**Step 3: Verify CLI help lists `init`**

```bash
pnpm dev -- --help
```

Expected: `init` appears in the subcommand list.

**Step 4: Verify `pnpm build` succeeds**

```bash
pnpm build
```

Expected: Clean build with no TypeScript errors.

**Step 5: Run pack dry-run**

```bash
npm pack --dry-run --registry=https://registry.npmjs.org
```

Expected: File list does not include source files outside `bin/`, `dist/`, `skills/`.

**Step 6: Commit**

```bash
git add packages/agent-task-loop/src/cli.ts
git commit -m "feat(cli): register init command"
```

---

## Done

All tasks complete when:
- `pnpm test` passes in `packages/agent-task-loop`
- `pnpm build` succeeds
- `npm pack --dry-run` file list is clean
- `agent-task-loop --help` lists `init`
- `agent-task-loop init` exits with instructions when `lark-cli` is missing
- `agent-task-loop init` prompts, writes config with discovered agents, and is idempotent
- Any command run from a directory without a project config resolves `~/.agent-task-loop/config.json`
- Error message when no config found references `agent-task-loop init`
