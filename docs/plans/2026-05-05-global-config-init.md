# Global Config & Init Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend config resolution to support `task.config.json`, a global `~/.agent-task-loop/config.json` fallback, and an `init` command for zero-friction first-run setup.

**Architecture:** Modify `resolveConfigPath` to walk the new candidate list (env var → project TS/JSON walk-up → global JSON); add a separate JSON loader path in `loadConfig`; add an `init` command that writes the global config template.

**Tech Stack:** Node.js 20 ESM, TypeScript, Zod, Vitest, `citty` CLI framework.

---

## Background

Issue #12 requires:

1. **New config resolution order** (first match wins):
   1. `--config` flag
   2. `AGENT_TASK_LOOP_CONFIG` env var
   3. Walk up from cwd: `task.config.ts` then `task.config.json` at each directory
   4. Global: `~/.agent-task-loop/config.json`

2. **JSON loading** – global config is always JSON; project config can also be JSON (`task.config.json`). JSON files must be loaded via `readFileSync` + `JSON.parse`, not dynamic `import()`.

3. **`init` command** – creates `~/.agent-task-loop/config.json` from a template if it doesn't already exist.

**Key files:**
- Modify: `packages/agent-task-loop/src/config/load-config.ts`
- Create: `packages/agent-task-loop/src/commands/init.ts`
- Modify: `packages/agent-task-loop/src/cli.ts`
- Modify: `packages/agent-task-loop/tests/config/load-config.test.ts`
- Create: `packages/agent-task-loop/tests/commands/init.test.ts`

**Run tests with:** `cd packages/agent-task-loop && pnpm test`

---

### Task 1: Support `task.config.json` as a project config candidate

**Files:**
- Modify: `packages/agent-task-loop/src/config/load-config.ts`
- Modify: `packages/agent-task-loop/tests/config/load-config.test.ts`

**Step 1: Write the failing test**

Add to `tests/config/load-config.test.ts` inside the existing `describe('loadConfig', ...)` block:

```ts
it('resolves task.config.json from the current working directory', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-json-'));
  const configPath = path.join(tempDir, 'task.config.json');

  await writeFile(
    configPath,
    JSON.stringify({
      feishu: { baseToken: 'json-base', tableId: 'json-table' },
      projects: {
        demo: {
          key: 'demo',
          name: 'JsonDemo',
          defaultRepository: 'demo_repo',
          workspaceRoot: '/tmp/demo',
          taskTemplatePrompt: 'hi',
        },
      },
      repositories: {
        demo_repo: {
          key: 'demo_repo',
          localPath: '/tmp/demo',
          defaultBranch: 'main',
          installCommand: 'pnpm install',
          testCommand: 'pnpm test',
          buildCommand: 'pnpm build',
          workspaceStrategy: 'worktree',
        },
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

  expect(resolveConfigPath().endsWith('/task.config.json')).toBe(true);

  const config = await loadConfig();
  expect(config.feishu.baseToken).toBe('json-base');
  expect(config.projects.demo.name).toBe('JsonDemo');
});
```

Also add cleanup for tempDir in that test (following the existing pattern – create a `tempDir` variable in `afterEach` if not already present; the existing tests use local let variables, follow the same pattern).

**Step 2: Run test to verify it fails**

```bash
cd packages/agent-task-loop && pnpm test tests/config/load-config.test.ts
```

Expected: FAIL – `task.config.json` is not found because it's not in `defaultConfigFilenames`.

**Step 3: Implement minimal fix in `load-config.ts`**

Replace the `defaultConfigFilenames` constant and add JSON loading support:

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

  const globalConfigPath = path.join(os.homedir(), '.agent-task-loop', 'config.json');
  candidates.push(globalConfigPath);

  const resolved = candidates.find(candidate => existsSync(candidate));
  if (!resolved) {
    throw new Error(
      `No task config found. Run \`agent-task-loop init\` to create a global config, or pass --config / set AGENT_TASK_LOOP_CONFIG.`,
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

**Step 4: Run test to verify it passes**

```bash
cd packages/agent-task-loop && pnpm test tests/config/load-config.test.ts
```

Expected: All tests PASS including the new JSON test.

**Step 5: Commit**

```bash
git add packages/agent-task-loop/src/config/load-config.ts packages/agent-task-loop/tests/config/load-config.test.ts
git commit -m "feat(config): support task.config.json and global ~/.agent-task-loop/config.json"
```

---

### Task 2: Test global config fallback

**Files:**
- Modify: `packages/agent-task-loop/tests/config/load-config.test.ts`

The previous task already added the global config path to `resolveConfigPath`. Now add tests to verify it is used as a fallback and that project config takes precedence over it.

**Step 1: Write the failing tests**

Add to `tests/config/load-config.test.ts`:

```ts
describe('global config fallback', () => {
  const originalHome = os.homedir;
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-home-'));
    // Redirect os.homedir() to our fake home
    (os as { homedir: () => string }).homedir = () => fakeHome;
  });

  afterEach(async () => {
    (os as { homedir: () => string }).homedir = originalHome;
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
        agents: {
          claude: { name: 'claude', command: 'claude', args: [], env: {} },
          codex: { name: 'codex', command: 'codex', args: [], env: {} },
          coco: { name: 'coco', command: 'coco', args: [], env: {} },
          glm: { name: 'glm', command: 'glm', args: [], env: {} },
        },
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
        agents: {
          claude: { name: 'claude', command: 'claude', args: [], env: {} },
          codex: { name: 'codex', command: 'codex', args: [], env: {} },
          coco: { name: 'coco', command: 'coco', args: [], env: {} },
          glm: { name: 'glm', command: 'glm', args: [], env: {} },
        },
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
        agents: {
          claude: { name: 'claude', command: 'claude', args: [], env: {} },
          codex: { name: 'codex', command: 'codex', args: [], env: {} },
          coco: { name: 'coco', command: 'coco', args: [], env: {} },
          glm: { name: 'glm', command: 'glm', args: [], env: {} },
        },
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

Update the imports at the top of the test file to include `mkdir`, `rm`, and `beforeEach`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig, resolveConfigPath } from '../../src/config/load-config';
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/agent-task-loop && pnpm test tests/config/load-config.test.ts
```

Expected: New tests FAIL (global config not yet reachable in test because `os.homedir()` mock may need adjustment — the module caches the path at import time).

> **Note:** If mocking `os.homedir()` doesn't work because `load-config.ts` calls `os.homedir()` at call time (not at module load time), the tests will pass without changes. If the global config path is computed eagerly at module load, you need to refactor `resolveConfigPath` to call `os.homedir()` lazily inside the function body — which is already what the implementation in Task 1 does. So tests should pass.

**Step 3: Run tests to verify they pass**

```bash
cd packages/agent-task-loop && pnpm test tests/config/load-config.test.ts
```

Expected: All PASS.

**Step 4: Commit**

```bash
git add packages/agent-task-loop/tests/config/load-config.test.ts
git commit -m "test(config): verify global config fallback and project config precedence"
```

---

### Task 3: Create the `init` command

**Files:**
- Create: `packages/agent-task-loop/src/commands/init.ts`
- Create: `packages/agent-task-loop/tests/commands/init.test.ts`

**Step 1: Write the failing test**

Create `tests/commands/init.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGlobalConfig } from '../../src/commands/init';

describe('createGlobalConfig', () => {
  const originalHome = os.homedir;
  let fakeHome: string;

  beforeEach(async () => {
    fakeHome = await mkdtemp(path.join(os.tmpdir(), 'agent-task-loop-init-'));
    (os as { homedir: () => string }).homedir = () => fakeHome;
  });

  afterEach(async () => {
    (os as { homedir: () => string }).homedir = originalHome;
    await rm(fakeHome, { recursive: true, force: true });
  });

  it('creates ~/.agent-task-loop/config.json with template content', async () => {
    await createGlobalConfig();

    const configPath = path.join(fakeHome, '.agent-task-loop', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty('feishu');
    expect(parsed).toHaveProperty('projects');
    expect(parsed).toHaveProperty('repositories');
    expect(parsed).toHaveProperty('agents');
  });

  it('does not overwrite an existing config', async () => {
    const globalDir = path.join(fakeHome, '.agent-task-loop');
    await mkdir(globalDir, { recursive: true });
    const configPath = path.join(globalDir, 'config.json');
    const existing = JSON.stringify({ feishu: { baseToken: 'existing', tableId: 'existing-table' } });
    await (await import('node:fs/promises')).writeFile(configPath, existing, 'utf8');

    await createGlobalConfig();

    const raw = await readFile(configPath, 'utf8');
    expect(raw).toBe(existing);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/agent-task-loop && pnpm test tests/commands/init.test.ts
```

Expected: FAIL – `createGlobalConfig` does not exist.

**Step 3: Implement `init.ts`**

Create `packages/agent-task-loop/src/commands/init.ts`:

```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineCommand } from 'citty';

const CONFIG_TEMPLATE = {
  feishu: {
    baseToken: 'YOUR_FEISHU_BASE_TOKEN',
    tableId: 'YOUR_FEISHU_TABLE_ID',
  },
  projects: {},
  repositories: {},
  agents: {
    claude: { name: 'claude', command: 'claude', args: [], env: {} },
  },
};

export function createGlobalConfig(): void {
  const globalDir = path.join(os.homedir(), '.agent-task-loop');
  const configPath = path.join(globalDir, 'config.json');

  if (existsSync(configPath)) {
    console.log(`Global config already exists: ${configPath}`);
    return;
  }

  mkdirSync(globalDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(CONFIG_TEMPLATE, null, 2) + '\n', 'utf8');
  console.log(`Created global config: ${configPath}`);
  console.log('Edit it to add your Feishu credentials, projects, repositories, and agents.');
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Create a global config at ~/.agent-task-loop/config.json',
  },
  async run() {
    createGlobalConfig();
  },
});
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/agent-task-loop && pnpm test tests/commands/init.test.ts
```

Expected: All PASS.

**Step 5: Commit**

```bash
git add packages/agent-task-loop/src/commands/init.ts packages/agent-task-loop/tests/commands/init.test.ts
git commit -m "feat(init): add init command to create global config template"
```

---

### Task 4: Register `init` in the CLI

**Files:**
- Modify: `packages/agent-task-loop/src/cli.ts`

**Step 1: Add import and register subcommand**

Edit `src/cli.ts`:

```ts
import { initCommand } from './commands/init';
```

Add `init: initCommand` to the `subCommands` object.

Full updated `subCommands` block:

```ts
subCommands: {
  cleanup: cleanupCommand,
  complete: completeCommand,
  init: initCommand,
  reject: rejectCommand,
  start: startCommand,
  run: runCommand,
  resume: resumeCommand,
  schema: schemaCommand,
  sync: syncCommand,
  tui: tuiCommand,
  watch: watchCommand,
},
```

**Step 2: Verify the CLI lists `init` in help output**

```bash
cd packages/agent-task-loop && pnpm dev -- --help
```

Expected: `init` appears in the subcommand list.

**Step 3: Run full test suite to verify no regressions**

```bash
cd packages/agent-task-loop && pnpm test
```

Expected: All tests PASS.

**Step 4: Commit**

```bash
git add packages/agent-task-loop/src/cli.ts
git commit -m "feat(cli): register init command"
```

---

### Task 5: Verify end-to-end behavior

This is a manual smoke-test checklist — run each and confirm the output.

**5a. Help shows `init`:**
```bash
cd packages/agent-task-loop && pnpm dev -- --help
```
Expected: `init` listed.

**5b. `init` creates the global config:**
```bash
cd packages/agent-task-loop && pnpm dev -- init
cat ~/.agent-task-loop/config.json
```
Expected: Template JSON printed.

**5c. `init` is idempotent (second run does not overwrite):**
```bash
cd packages/agent-task-loop && pnpm dev -- init
```
Expected: "Global config already exists" message, file unchanged.

**5d. `watch` (or any command) resolves global config when no project config is present:**

In a temp empty directory, confirm the error message now says to run `init` instead of the old "Looked for: ..." message:

```bash
cd /tmp && mkdir empty-test && cd empty-test && pnpm dlx @rivus/agent-task-loop watch 2>&1 || true
```
(or use `pnpm dev` from the package root with the cwd changed)

Expected: Error mentions `agent-task-loop init`.

**5e. Commit if all manual checks pass (no code changes expected here).**

---

## Done

All tasks complete when:
- `pnpm test` passes in `packages/agent-task-loop`
- `init` command appears in CLI help
- Global config created on first `init`, skipped on repeat
- Error message when no config found references `init`
