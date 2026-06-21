# GitHub-Only Task Source + TUI Publish + AI Refine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent Task Loop fully runnable with GitHub Issues as the sole task source, manageable from the TUI (publish a task → it becomes a linked GitHub issue), with optional AI refinement of the task description before publish.

**Architecture:** Implements merged RFC 0005 (`rfcs/0005-github-only-task-source.md`): Feishu becomes optional in the config schema, config loading collapses to JSON-only / global-first resolution, the provider/runtime-guard layers stop assuming Feishu, and `init`/`schema` adapt. On top of the RFC, the TUI's create-task form (which already exists and already routes a create to `GitHubIssuesTaskProvider.createTask` → `POST /issues`) is unblocked for GitHub-only configs, and a new structured-AI service (extracted from the existing `complete.ts` `runPublishAi`) powers an in-form "refine description" action.

**Tech Stack:** TypeScript, pnpm monorepo, zod (config schema), citty (commands), Ink/React (TUI), execa (agent subprocess), vitest + ink-testing-library (tests), changesets (release).

## Global Constraints

- Node `>=20`; `"type": "module"`; all imports use extensionless or `.js`-less TS source paths matching existing files (e.g. `from './schema'`).
- No hardcoded style/values rule does not apply (CLI/TUI text only); follow existing copy conventions.
- Config is **JSON only**, resolved from exactly: `--config <file>` → `AGENT_TASK_LOOP_CONFIG` → `~/.agent-task-loop/config.json`. No cwd walk-up, no package-example fallback, no `.ts`/`.js` dynamic import.
- At least one task source (`feishu` or `githubIssues`) MUST be configured; neither → clear error.
- GitHub token chain: `config.githubIssues.token ?? process.env.GITHUB_TOKEN ?? \`gh auth token\``. Never write a token to config.
- Per-package `test` script must build dist first where downstream from-source resolution needs it (existing convention) — do not regress.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit. Frequent commits.
- This is a single PR. Final commit includes a changeset and `Closes #24`.

---

## File Structure

**Config (RFC core):**
- `packages/agent-task-loop/src/config/schema.ts` — MODIFY: extract `feishuConfigSchema`, make `feishu` optional, refine ≥1 source.
- `packages/agent-task-loop/src/config/load-config.ts` — MODIFY: 3-step resolution, JSON-only.
- `packages/agent-task-loop/src/config/runtime-guard.ts` — MODIFY: rename + generalize guard.

**Providers (RFC core):**
- `packages/agent-task-loop/src/task-management/build-task-provider.ts` — MODIFY: conditional providers + smart defaultSource.
- `packages/agent-task-loop/src/task-management/github-issues-task-provider.ts` — MODIFY: `gh auth token` fallback.

**Commands (RFC core):**
- `packages/agent-task-loop/src/commands/schema.ts` — MODIFY: notice + exit 0 when no feishu.
- `packages/agent-task-loop/src/commands/init.ts` — MODIFY: source-selection step.
- 8 other command callers — MODIFY: rename `assertFeishuRuntimeConfig` → `assertRuntimeConfig`.

**TUI publish (goal):**
- `packages/agent-task-loop/src/commands/tui.tsx` — MODIFY: derive `sources` from both feishu + github; wire `onRefineDescription`.

**AI refine (goal):**
- `packages/agent-task-loop/src/services/structured-ai-service.ts` — CREATE: reusable `runStructuredAi<T>()` (extracted from `complete.ts`).
- `packages/agent-task-loop/src/commands/complete.ts` — MODIFY: consume the extracted service (DRY).
- `packages/agent-task-loop/src/services/refine-prompt-service.ts` — CREATE: `buildRefineDescriptionPrompt()`.
- `packages/agent-task-loop/src/services/refine-description-service.ts` — CREATE: `refineDescription()` wrapper (selects claude agent, degrades).
- `packages/agent-task-loop/src/tui/components/TaskForm.tsx` — MODIFY: add refine action on the description field.
- `packages/agent-task-loop/src/tui/components/App.tsx` — MODIFY: thread `onRefineDescription` to the form.

**Config example / ignore (RFC core):**
- `packages/agent-task-loop/config.example.json` — CREATE (replaces `task.config.example.ts`).
- `packages/agent-task-loop/task.config.example.ts` — DELETE.
- `.gitignore` — MODIFY: remove `**/task.config.ts`.

**Docs / release:**
- `packages/agent-task-loop/README.md` — MODIFY: document GitHub-only config + JSON-only resolution + AI refine.
- `.changeset/<name>.md` — CREATE.

---

## Task 1: Feishu-optional config schema

**Files:**
- Modify: `packages/agent-task-loop/src/config/schema.ts`
- Test: `packages/agent-task-loop/tests/config/schema.test.ts` (create if absent)

**Interfaces:**
- Produces: `feishuConfigSchema` (zod), `appConfigSchema` with `feishu?: FeishuConfig`, `githubIssues?: GitHubIssuesConfig`; superRefine error message `configure at least one task source: feishu or githubIssues`. `type FeishuConfig = z.infer<typeof feishuConfigSchema>`.

- [ ] **Step 1: Write the failing test** — `tests/config/schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { appConfigSchema } from '../../src/config/schema';

const base = { projects: {}, repositories: {}, agents: {} };
const feishu = { baseToken: 'tok', tableId: 'tbl' };
const github = { owner: 'o', repo: 'r' };

describe('appConfigSchema', () => {
  it('accepts feishu-only', () => {
    expect(appConfigSchema.safeParse({ ...base, feishu }).success).toBe(true);
  });
  it('accepts github-only (no feishu)', () => {
    expect(appConfigSchema.safeParse({ ...base, githubIssues: github }).success).toBe(true);
  });
  it('accepts both', () => {
    expect(appConfigSchema.safeParse({ ...base, feishu, githubIssues: github }).success).toBe(true);
  });
  it('rejects neither with a clear message', () => {
    const r = appConfigSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('at least one task source');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd packages/agent-task-loop && pnpm vitest run tests/config/schema.test.ts` → FAIL ("github-only" rejected because `feishu` required).

- [ ] **Step 3: Implement** — in `schema.ts`, extract and make optional:

```typescript
export const feishuConfigSchema = z.object({
  baseToken: z.string().min(1),
  tableId: z.string().min(1),
  viewId: z.string().optional(),
});

export type FeishuConfig = z.infer<typeof feishuConfigSchema>;

export const appConfigSchema = z
  .object({
    feishu: feishuConfigSchema.optional(),
    githubIssues: githubIssuesConfigSchema.optional(),
    projects: z.record(projectConfigSchema),
    repositories: z.record(repositoryConfigSchema),
    agents: z.record(agentConfigSchema),
  })
  .superRefine((cfg, ctx) => {
    if (!cfg.feishu && !cfg.githubIssues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'configure at least one task source: feishu or githubIssues',
      });
    }
  });
```

- [ ] **Step 4: Run test to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(config): make feishu optional, require >=1 task source"`

---

## Task 2: JSON-only, global-first config resolution

**Files:**
- Modify: `packages/agent-task-loop/src/config/load-config.ts`
- Test: `packages/agent-task-loop/tests/config/load-config.test.ts`

**Interfaces:**
- Produces: `resolveConfigPath(configPath?: string): string` (3-step), `loadConfig(configPath?): Promise<AppConfig>` (JSON only). Removes `defaultConfigFilenames`, `walkUpDirectories`, package-root + cwd lookup, and dynamic `import()`.

- [ ] **Step 1: Read the existing test** — `tests/config/load-config.test.ts` to learn its fixture style (tmp dirs, env var save/restore). Preserve still-valid cases; remove cwd-walk-up and `.ts` cases.

- [ ] **Step 2: Write/adjust failing tests** covering:
  - `--config` to a `.json` file → loads & parses it.
  - `AGENT_TASK_LOOP_CONFIG` env → loads it when no `--config`.
  - none set + no global file → throws "No config found" (use a `HOME`/`os.homedir` override or a path that does not exist; if the test cannot stub homedir, assert the error type via a non-existent `--config`).
  - a non-`.json` path passed to `--config` → still `JSON.parse`d (we no longer special-case extension); a `.ts` file with TS syntax → throws a JSON parse error (proves no dynamic import).

```typescript
it('parses an explicit --config JSON file', async () => {
  const file = writeTmp('cfg.json', JSON.stringify({ githubIssues: { owner: 'o', repo: 'r' }, projects: {}, repositories: {}, agents: {} }));
  const cfg = await loadConfig(file);
  expect(cfg.githubIssues?.owner).toBe('o');
});

it('does not evaluate TS/JS config (JSON only)', async () => {
  const file = writeTmp('cfg.ts', 'export default { feishu: {} }');
  await expect(loadConfig(file)).rejects.toThrow();
});
```

- [ ] **Step 3: Run tests to verify failure** — `pnpm vitest run tests/config/load-config.test.ts`.

- [ ] **Step 4: Implement** — replace body:

```typescript
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig } from './schema';
import { appConfigSchema } from './schema';

export function globalConfigPath(): string {
  return path.join(os.homedir(), '.agent-task-loop', 'config.json');
}

export function resolveConfigPath(configPath?: string): string {
  if (configPath) {
    const explicit = path.resolve(process.cwd(), configPath);
    if (!existsSync(explicit)) throw new Error(`Config file not found: ${explicit}`);
    return explicit;
  }
  const env = process.env.AGENT_TASK_LOOP_CONFIG;
  if (env) return path.resolve(process.cwd(), env);

  const global = globalConfigPath();
  if (existsSync(global)) return global;

  throw new Error(
    'No config found. Run `agent-task-loop init`, or pass --config / set AGENT_TASK_LOOP_CONFIG.',
  );
}

export async function loadConfig(configPath?: string): Promise<AppConfig> {
  const resolved = resolveConfigPath(configPath);
  const raw = JSON.parse(readFileSync(resolved, 'utf8'));
  return appConfigSchema.parse(raw);
}
```

(Note: `globalConfigPath` here may duplicate the one in `init.ts`; in Step 4 also update `init.ts` to import this one — see Task 8 — to keep a single source. If import cycles arise, keep `init.ts`'s local copy and leave a `// keep in sync` comment.)

- [ ] **Step 5: Run tests to verify pass.**

- [ ] **Step 6: Commit** — `git commit -am "feat(config): JSON-only, global-first config resolution"`

---

## Task 3: Generalize the runtime guard + rename 9 callers

**Files:**
- Modify: `packages/agent-task-loop/src/config/runtime-guard.ts`
- Modify (callers): `commands/schema.ts:27`, `commands/reject.ts:32`, `commands/watch.ts:157`, `commands/complete.ts:133`, `commands/start.ts:33`, `commands/cleanup.ts:33`, `commands/tui.tsx:30`, `commands/resume.ts:22`, `commands/run.ts:44`
- Test: `packages/agent-task-loop/tests/config/runtime-guard.test.ts`

**Interfaces:**
- Produces: `assertRuntimeConfig(config: AppConfig): void`. Throws if neither source present; if `config.feishu` present, runs the existing placeholder check; if only github, passes.

- [ ] **Step 1: Update the existing test** to import `assertRuntimeConfig` and add cases: github-only passes; feishu placeholder still throws; neither throws.

```typescript
import { assertRuntimeConfig } from '../../src/config/runtime-guard';
const base = { projects: {}, repositories: {}, agents: {} } as any;

it('passes for github-only', () => {
  expect(() => assertRuntimeConfig({ ...base, githubIssues: { owner: 'o', repo: 'r' } })).not.toThrow();
});
it('rejects placeholder feishu', () => {
  expect(() => assertRuntimeConfig({ ...base, feishu: { baseToken: 'demo', tableId: 'tbl' } })).toThrow(/Replace the example/);
});
it('rejects when no source', () => {
  expect(() => assertRuntimeConfig(base)).toThrow(/at least one task source/);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `runtime-guard.ts`:

```typescript
import type { AppConfig } from './schema';

export function assertRuntimeConfig(config: AppConfig): void {
  if (!config.feishu && !config.githubIssues) {
    throw new Error('configure at least one task source: feishu or githubIssues');
  }
  if (config.feishu) {
    const { baseToken, tableId } = config.feishu;
    const ph = (v: string) => v.includes('demo') || v.includes('example');
    if (ph(baseToken) || ph(tableId)) {
      throw new Error(
        'Replace the example Feishu baseToken/tableId with real values before running live commands.',
      );
    }
  }
}
```

- [ ] **Step 4: Rename callers** — in each of the 9 files, replace the import and call site `assertFeishuRuntimeConfig` → `assertRuntimeConfig`. Verify with `grep -rn "assertFeishuRuntimeConfig" packages/agent-task-loop/src` → no matches.

- [ ] **Step 5: Run** the guard test + `pnpm -C packages/agent-task-loop typecheck` → PASS.

- [ ] **Step 6: Commit** — `git commit -am "refactor(config): assertRuntimeConfig (feishu-optional) + update callers"`

---

## Task 4: Conditional provider composition

**Files:**
- Modify: `packages/agent-task-loop/src/task-management/build-task-provider.ts`
- Test: `packages/agent-task-loop/tests/task-management/build-task-provider.test.ts` (create)

**Interfaces:**
- Consumes: `FeishuTaskProvider(config)`, `GitHubIssuesTaskProvider(config.githubIssues)`, `CompositeTaskProvider(providers, { defaultSource })`, `FEISHU_SOURCE`, and GitHub source const.
- Produces: `buildTaskProvider(config): TaskProvider` — single source returned directly; both → composite with `defaultSource = feishu` if present else github.

- [ ] **Step 1: Find the GitHub source constant** — `grep -rn "source = " packages/agent-task-loop/src/task-management/github-issues-task-provider.ts` (likely `GITHUB_SOURCE`/`'github'`). Use the exported constant if present; else `'github'`.

- [ ] **Step 2: Write failing test** asserting `.source` of the returned provider:

```typescript
import { describe, expect, it } from 'vitest';
import { buildTaskProvider } from '../../src/task-management/build-task-provider';
const base = { projects: {}, repositories: {}, agents: {} } as any;

it('github-only → single github provider', () => {
  const p = buildTaskProvider({ ...base, githubIssues: { owner: 'o', repo: 'r', defaultAgent: 'codex' } });
  expect((p as any).source).toBe('github');
});
it('feishu-only → single feishu provider', () => {
  const p = buildTaskProvider({ ...base, feishu: { baseToken: 't', tableId: 'b' } });
  expect((p as any).source).toBe('feishu');
});
it('both → composite (no single .source)', () => {
  const p = buildTaskProvider({ ...base, feishu: { baseToken: 't', tableId: 'b' }, githubIssues: { owner: 'o', repo: 'r', defaultAgent: 'codex' } });
  expect((p as any).source).toBeUndefined();
});
```

- [ ] **Step 3: Run → fail** (feishu-only path currently fine; github-only currently still builds a Feishu provider as element 0 → `.source` would be `'feishu'` → fails).

- [ ] **Step 4: Implement:**

```typescript
export function buildTaskProvider(config: AppConfig): TaskProvider {
  const providers: SourceProvider[] = [];
  if (config.feishu) providers.push(new FeishuTaskProvider(config));
  if (config.githubIssues) providers.push(new GitHubIssuesTaskProvider(config.githubIssues));

  if (providers.length === 0) {
    throw new Error('configure at least one task source: feishu or githubIssues');
  }
  if (providers.length === 1) return providers[0]!;

  const defaultSource = config.feishu ? FEISHU_SOURCE : GITHUB_SOURCE;
  return new CompositeTaskProvider(providers, { defaultSource });
}
```

(If `FeishuTaskProvider` constructor requires a non-optional `config.feishu`, it is only constructed when `config.feishu` is truthy — TS-narrow with `config.feishu ? new FeishuTaskProvider(config) : …` already guarantees this. Confirm the constructor reads `config.feishu` and adjust the type if needed.)

- [ ] **Step 5: Run → pass; `typecheck`.**

- [ ] **Step 6: Commit** — `git commit -am "feat(tasks): conditional provider composition (feishu/github optional)"`

---

## Task 5: GitHub token `gh auth token` fallback

**Files:**
- Modify: `packages/agent-task-loop/src/task-management/github-issues-task-provider.ts`
- Test: `packages/agent-task-loop/tests/services/github-issues-task-provider.test.ts`

**Interfaces:**
- Produces: token resolution `config.token ?? process.env.GITHUB_TOKEN ?? <gh auth token output>`; cached after first lookup; degrades to undefined (no Authorization header) when `gh` missing/errors. Implement as a private async `resolveToken(): Promise<string | undefined>` used by `api()`.

- [ ] **Step 1: Inspect the existing test file** to see how `fetch`/`execa` are mocked.

- [ ] **Step 2: Write failing test** — with no `config.token` and no `GITHUB_TOKEN`, a mocked `gh auth token` returning `ghp_xyz` results in `Authorization: Bearer ghp_xyz`. Mock `execa` (or `child_process.execFile`) for `gh auth token`. Also: when `gh` throws, request still goes out with no Authorization header.

```typescript
vi.mock('execa', () => ({ execa: vi.fn(async () => ({ stdout: 'ghp_xyz\n', exitCode: 0 })) }));
// ... assert fetch called with headers.Authorization === 'Bearer ghp_xyz'
```

- [ ] **Step 3: Run → fail.**

- [ ] **Step 4: Implement** `resolveToken()` (cache in a field `#tokenPromise`):

```typescript
private tokenResolved?: string | undefined;
private tokenResolvedDone = false;

private async resolveToken(): Promise<string | undefined> {
  if (this.tokenResolvedDone) return this.tokenResolved;
  let token = this.config.token ?? process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      const { execa } = await import('execa');
      const { stdout } = await execa('gh', ['auth', 'token'], { reject: false });
      const t = stdout.trim();
      if (t) token = t;
    } catch {
      /* gh missing — degrade to unauthenticated */
    }
  }
  this.tokenResolved = token;
  this.tokenResolvedDone = true;
  return token;
}
```

Update `api()` to `const token = await this.resolveToken();`.

- [ ] **Step 5: Run → pass; `typecheck`.**

- [ ] **Step 6: Commit** — `git commit -am "feat(github): fall back to \`gh auth token\` for the API token"`

---

## Task 6: `schema` command notice when no Feishu

**Files:**
- Modify: `packages/agent-task-loop/src/commands/schema.ts`
- Test: `packages/agent-task-loop/tests/commands/schema.test.ts`

**Interfaces:**
- Produces: when `config.feishu` is absent, print the notice line and return (exit 0) without constructing `TaskTableSchemaService`.

- [ ] **Step 1: Inspect existing schema.test.ts** for how it loads config / captures output.

- [ ] **Step 2: Write failing test** — with a github-only config, `run` prints `No Feishu source configured` and does NOT throw / does NOT call the schema service.

- [ ] **Step 3: Run → fail.**

- [ ] **Step 4: Implement** — after `loadConfig` + `assertRuntimeConfig`:

```typescript
if (!config.feishu) {
  printCommandOutput({
    json: Boolean(args.json),
    jsonValue: { skipped: true, reason: 'no-feishu-source' },
    textLines: ['No Feishu source configured; schema applies only to Feishu Base. GitHub Issues need no schema.'],
  });
  return;
}
```

- [ ] **Step 5: Run → pass.**

- [ ] **Step 6: Commit** — `git commit -am "feat(schema): notice + exit 0 when no Feishu source"`

---

## Task 7: TUI `sources` derivation (unblock GitHub-only publish)

**Files:**
- Modify: `packages/agent-task-loop/src/commands/tui.tsx`
- Test: covered by manual/integration; add a small unit if a pure helper is extracted.

**Interfaces:**
- Produces: `sources = [...(config.feishu ? ['feishu'] : []), ...(config.githubIssues ? ['github'] : [])]`.

- [ ] **Step 1: Edit `tui.tsx`** — replace the hardcoded `const sources = ['feishu', ...]` line with the conditional above. (The `assertFeishuRuntimeConfig` call here is already renamed in Task 3.)

- [ ] **Step 2: Sanity** — `pnpm -C packages/agent-task-loop typecheck`. In GitHub-only mode `sources === ['github']` → `TaskForm` hides the selector and defaults `source` to `'github'`, so a created task routes to `GitHubIssuesTaskProvider.createTask` → `POST /issues`.

- [ ] **Step 3: Commit** — `git commit -am "feat(tui): derive create-form sources from configured backends"`

---

## Task 8: `init` source selection + global JSON config

**Files:**
- Modify: `packages/agent-task-loop/src/commands/init.ts`
- Test: `packages/agent-task-loop/tests/commands/init.test.ts`

**Interfaces:**
- Produces: `createGlobalConfig(inputs)` where `inputs` carries an optional `feishu?: { baseToken; tableId }` and optional `githubIssues?: { owner; repo; defaultAgent }`, writing only the configured blocks. The interactive `run()` asks which source(s) first; GitHub path prompts owner/repo (default from `gh repo view --json ...` when available) + defaultAgent and stores no token; Feishu path keeps existing prompts. lark-cli install prompt becomes conditional on choosing Feishu.

- [ ] **Step 1: Inspect existing init.test.ts** (it tests `createGlobalConfig` and discovery). Keep its contract for the pure helpers; extend `createGlobalConfig`'s input shape.

- [ ] **Step 2: Write failing tests:**

```typescript
it('writes github-only config without feishu', () => {
  const dir = mkdtemp();
  vi.spyOn(os, 'homedir').mockReturnValue(dir);
  createGlobalConfig({ githubIssues: { owner: 'o', repo: 'r', defaultAgent: 'codex' }, agents: {} });
  const cfg = JSON.parse(readFileSync(join(dir, '.agent-task-loop/config.json'), 'utf8'));
  expect(cfg.feishu).toBeUndefined();
  expect(cfg.githubIssues).toEqual({ owner: 'o', repo: 'r', defaultAgent: 'codex' });
});

it('writes feishu-only config without githubIssues', () => {
  // ... existing feishu shape still supported via { feishu: { baseToken, tableId } }
});
```

- [ ] **Step 3: Run → fail** (current `createGlobalConfig` requires `baseToken`/`tableId` and always writes feishu).

- [ ] **Step 4: Implement** — new input shape:

```typescript
export interface GlobalConfigInputs {
  feishu?: { baseToken: string; tableId: string };
  githubIssues?: { owner: string; repo: string; defaultAgent: string };
  agents: Record<string, { name: string; command: string; args: string[]; env: Record<string, string> }>;
}

export function createGlobalConfig(inputs: GlobalConfigInputs): 'created' | 'exists' {
  const configPath = globalConfigPath();
  if (existsSync(configPath)) return 'exists';
  mkdirSync(path.dirname(configPath), { recursive: true });
  const config: Record<string, unknown> = { projects: {}, repositories: {}, agents: inputs.agents };
  if (inputs.feishu) config.feishu = inputs.feishu;
  if (inputs.githubIssues) config.githubIssues = inputs.githubIssues;
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return 'created';
}
```

Then the interactive `run()`: prompt `Which task source? [g]ithub / [f]eishu / [b]oth` (default github). For github: prompt owner/repo (prefill from `gh repo view --json owner,name` parsed when available), prompt defaultAgent (default `codex`). For feishu: existing prompts + the lark-cli availability/install gate (move that gate so it only runs when feishu is chosen). Assemble `GlobalConfigInputs` and call `createGlobalConfig`.

- [ ] **Step 5: Run → pass; `typecheck`.**

- [ ] **Step 6: Commit** — `git commit -am "feat(init): source selection (github/feishu/both) + github-only global config"`

---

## Task 9: Extract reusable structured-AI service (DRY from complete.ts)

**Files:**
- Create: `packages/agent-task-loop/src/services/structured-ai-service.ts`
- Modify: `packages/agent-task-loop/src/commands/complete.ts` (consume it)
- Test: `packages/agent-task-loop/tests/services/structured-ai-service.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface StructuredAiInput {
    command: string; args: string[]; env: Record<string, string>;
    cwd: string; sessionName: string; prompt: string; schema: Record<string, unknown>;
    timeoutMs?: number;
  }
  export interface StructuredAiResult<T> { data: T; sessionId?: string; sessionName: string; }
  export function extractClaudeStructured<T>(output: string): { data: T; sessionId?: string };
  export async function runStructuredAi<T>(input: StructuredAiInput): Promise<StructuredAiResult<T>>;
  ```
  Behaviour identical to the current `complete.ts` `runPublishAi` + `extractClaudeStructured` (same execa flags: `-p -n <session> --output-format stream-json --verbose --json-schema <json> --tools '' --permission-mode bypassPermissions <prompt>`; `timeout` default 120_000).

- [ ] **Step 1: Write failing test** — `extractClaudeStructured` parses a stream-json string with a `system/init` (session id) line and a `result` line carrying `structured_output`, and throws on `is_error` / unparseable:

```typescript
import { describe, expect, it } from 'vitest';
import { extractClaudeStructured } from '../../src/services/structured-ai-service';

it('pulls structured_output and session id', () => {
  const out = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }),
    JSON.stringify({ type: 'result', structured_output: { message: 'hi' } }),
  ].join('\n');
  const r = extractClaudeStructured<{ message: string }>(out);
  expect(r.data.message).toBe('hi');
  expect(r.sessionId).toBe('s1');
});

it('throws on error result', () => {
  const out = JSON.stringify({ type: 'result', is_error: true, result: 'boom' });
  expect(() => extractClaudeStructured(out)).toThrow('boom');
});
```

- [ ] **Step 2: Run → fail** (module doesn't exist).

- [ ] **Step 3: Implement** — move `stripCodeFences` (export it too), `extractClaudeStructured`, and `runStructuredAi` (the renamed `runPublishAi`, generalized — it already only needs command/args/env/cwd/sessionName/prompt/schema; drop the unused `task` field) into the new file.

- [ ] **Step 4: Refactor `complete.ts`** — delete its local `runPublishAi`/`extractClaudeStructured`/`stripCodeFences`; import from the service; pass `cwd: input.workspacePath`. Keep behavior identical.

- [ ] **Step 5: Run** the new test + existing complete tests (`pnpm vitest run tests/services tests/commands/complete*`) + `typecheck` → PASS.

- [ ] **Step 6: Commit** — `git commit -am "refactor(ai): extract reusable runStructuredAi service from complete"`

---

## Task 10: Refine-description prompt + service

**Files:**
- Create: `packages/agent-task-loop/src/services/refine-prompt-service.ts`
- Create: `packages/agent-task-loop/src/services/refine-description-service.ts`
- Test: `packages/agent-task-loop/tests/services/refine-prompt-service.test.ts`, `tests/services/refine-description-service.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // refine-prompt-service.ts
  export function buildRefineDescriptionPrompt(input: { title: string; description: string }): string;

  // refine-description-service.ts
  export interface RefineDescriptionDeps {
    runStructuredAi?: typeof runStructuredAi; // injectable for tests
  }
  export async function refineDescription(
    config: AppConfig,
    input: { title: string; description: string },
    deps?: RefineDescriptionDeps,
  ): Promise<string>;
  ```
  `refineDescription` requires a configured `claude` agent (`config.agents.claude`); if absent it throws `Error('AI refine needs a configured \`claude\` agent')`. Uses schema `{ type:'object', additionalProperties:false, properties:{ description:{type:'string'} }, required:['description'] }`, sessionName `refine-description-claude`, `cwd: process.cwd()`. Returns `stripCodeFences(result.data.description)`.

- [ ] **Step 1: Write failing prompt test** — asserts the prompt contains the title, the original description, asks for a refined description, and asks for strict JSON `{"description": "..."}` with no code fences (mirror the publish-prompt convention).

- [ ] **Step 2: Write failing service test** — inject a fake `runStructuredAi` returning `{ data: { description: '```\nrefined\n```' }, sessionName: 'x' }`; assert `refineDescription` returns `'refined'` (fences stripped). Add a test: config without `agents.claude` → rejects with the agent error.

- [ ] **Step 3: Run → fail** (modules missing).

- [ ] **Step 4: Implement** both files. `refine-description-service.ts`:

```typescript
import type { AppConfig } from '../config/schema';
import { runStructuredAi, stripCodeFences } from './structured-ai-service';
import { buildRefineDescriptionPrompt } from './refine-prompt-service';

const schema = {
  type: 'object', additionalProperties: false,
  properties: { description: { type: 'string' } }, required: ['description'],
} as const;

export interface RefineDescriptionDeps { runStructuredAi?: typeof runStructuredAi; }

export async function refineDescription(
  config: AppConfig,
  input: { title: string; description: string },
  deps: RefineDescriptionDeps = {},
): Promise<string> {
  const agent = config.agents.claude;
  if (!agent) throw new Error('AI refine needs a configured `claude` agent');
  const run = deps.runStructuredAi ?? runStructuredAi;
  const result = await run<{ description: string }>({
    command: agent.command, args: agent.args, env: agent.env,
    cwd: process.cwd(), sessionName: 'refine-description-claude',
    prompt: buildRefineDescriptionPrompt(input), schema,
  });
  return stripCodeFences(result.data.description);
}
```

- [ ] **Step 5: Run → pass; `typecheck`.**

- [ ] **Step 6: Commit** — `git commit -am "feat(ai): description refinement prompt + service"`

---

## Task 11: Wire AI refine into TaskForm + App + tui

**Files:**
- Modify: `packages/agent-task-loop/src/tui/components/TaskForm.tsx`
- Modify: `packages/agent-task-loop/src/tui/components/App.tsx`
- Modify: `packages/agent-task-loop/src/commands/tui.tsx`
- Test: `packages/agent-task-loop/tests/tui/components/TaskForm.test.tsx`

**Interfaces:**
- Consumes: `refineDescription` (via `tui.tsx` wiring `onRefineDescription`).
- Produces:
  - `TaskFormProps.onRefineDescription?: (input: { title: string; description: string }) => Promise<string>`.
  - When present, pressing `Ctrl+R` (any field) triggers refine: sets a `refining` flag, calls the prop, replaces the `description` state with the result, surfaces errors inline. Hint text mentions `[^R] refine` only when the prop is set.
  - `AppProps.onRefineDescription?` threaded straight to `TaskForm`.
  - `tui.tsx`: build `onRefineDescription` only when `config.agents.claude` exists, calling `refineDescription(config, input)`.

- [ ] **Step 1: Write failing TaskForm test** — provide `onRefineDescription = vi.fn(async () => 'REFINED')`; type a title + description; send Ctrl+R (`''`); after tick, the frame contains `REFINED` and the fn was called with the typed `{ title, description }`.

```typescript
it('refines the description on Ctrl+R', async () => {
  const onRefine = vi.fn(async () => 'REFINED TEXT');
  const app = render(<TaskForm onSubmit={vi.fn()} onCancel={vi.fn()} onRefineDescription={onRefine} />);
  await tick();
  app.stdin.write('IDEA-9'); await tick();      // taskId
  app.stdin.write('\t'); await tick();           // → title
  app.stdin.write('Add feature'); await tick();  // title
  app.stdin.write(''); await tick();       // Ctrl+R
  expect(onRefine).toHaveBeenCalledWith(expect.objectContaining({ title: 'Add feature' }));
  expect(stripAnsi(app.lastFrame() ?? '')).toContain('REFINED TEXT');
  app.unmount();
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement TaskForm** — add prop; add `refining`/`refineError` state; in `useInput`, before the text-append branch:

```typescript
if (key.ctrl && (input === 'r' || input === '') && onRefineDescription && !refining) {
  setRefining(true); setRefineError(null);
  Promise.resolve(onRefineDescription({ title: title.trim(), description: description.trim() }))
    .then(next => setDescription(next))
    .catch(e => setRefineError(e instanceof Error ? e.message : String(e)))
    .finally(() => setRefining(false));
  return;
}
```

Render `refining ? 'Refining…'` and `refineError` lines; append `[^R] refine` to the hint when the prop is set.

- [ ] **Step 4: Thread through App** — add `onRefineDescription?` to `AppProps`, pass it to `<TaskForm onRefineDescription={onRefineDescription} />`.

- [ ] **Step 5: Wire tui.tsx** — after building `service`/`sources`:

```typescript
const onRefineDescription = config.agents.claude
  ? (input: { title: string; description: string }) => refineDescription(config, input)
  : undefined;
// ...pass onRefineDescription={onRefineDescription} to <App/>
```

- [ ] **Step 6: Run** TaskForm tests + App tests + `typecheck` → PASS.

- [ ] **Step 7: Commit** — `git commit -am "feat(tui): Ctrl+R AI-refine of the new-task description"`

---

## Task 12: Replace example config + .gitignore + docs

**Files:**
- Create: `packages/agent-task-loop/config.example.json`
- Delete: `packages/agent-task-loop/task.config.example.ts`
- Modify: `.gitignore`
- Modify: `packages/agent-task-loop/README.md`

- [ ] **Step 1: Create `config.example.json`** — a JSON mirror of the old example with both sources shown (feishu real-ish placeholders + githubIssues), `projects`/`repositories`/`agents`. JSON has no comments, so document the optional/either-or nature in the README instead.

```json
{
  "githubIssues": { "owner": "your-org", "repo": "your-repo", "defaultAgent": "codex" },
  "feishu": { "baseToken": "your_base_token", "tableId": "your_table_id" },
  "projects": {
    "demo": { "key": "demo", "name": "Demo", "defaultRepository": "demo_app", "workspaceRoot": "/workspace/demo-worktrees", "deployProfile": "staging", "taskTemplatePrompt": "请按仓库内 AGENTS.md 执行任务。" }
  },
  "repositories": {
    "demo_app": { "key": "demo_app", "localPath": "/workspace/demo-app", "defaultBranch": "main", "installCommand": "pnpm install", "testCommand": "pnpm test", "buildCommand": "pnpm build", "deployCommand": "pnpm deploy:small", "workspaceStrategy": "worktree" }
  },
  "agents": {
    "claude": { "name": "claude", "command": "claude", "args": [], "env": {} },
    "codex": { "name": "codex", "command": "codex", "args": [], "env": {} }
  }
}
```

- [ ] **Step 2: Delete** `task.config.example.ts`.

- [ ] **Step 3: Edit `.gitignore`** — remove the `**/task.config.ts` line.

- [ ] **Step 4: Update README** — sections: "Config resolution (JSON only: --config → AGENT_TASK_LOOP_CONFIG → ~/.agent-task-loop/config.json)"; "GitHub-only mode" (githubIssues without feishu; token from `gh auth token`); "Publish from the TUI" (`n` → form → GitHub issue; multi-source shows a selector); "AI refine (`Ctrl+R`, needs a `claude` agent)".

- [ ] **Step 5: Verify** no stale references — `grep -rn "task.config" packages/agent-task-loop/src packages/agent-task-loop/README.md` returns only intentional mentions.

- [ ] **Step 6: Commit** — `git commit -am "docs: config.example.json + GitHub-only/AI-refine docs; drop task.config.ts"`

---

## Task 13: Full build/test gate + changeset + PR

**Files:**
- Create: `.changeset/<slug>.md`

- [ ] **Step 1: Whole-repo gate** — from repo root: `pnpm -r build && pnpm -r test && pnpm -r typecheck`. All green. Paste output. (Mirrors CI ordering; fix any from-source-dist issues per the existing convention.)

- [ ] **Step 2: Manual smoke (GitHub-only)** — write a tmp github-only JSON config (no feishu), run `node packages/agent-task-loop/bin/agent-task-loop.mjs --config <tmp> schema --json` → prints the "No Feishu source" notice, exit 0. Run `sync --config <tmp>` → counts ok. (TUI needs a TTY; verify via the App/TaskForm unit tests instead.)

- [ ] **Step 3: Changeset** — `.changeset/github-only-task-source.md`:

```markdown
---
"@rivus/agent-task-loop": minor
---

GitHub-Issues-only task source: feishu is now optional (configure at least one of feishu/githubIssues). Config is JSON-only and resolved from --config → AGENT_TASK_LOOP_CONFIG → ~/.agent-task-loop/config.json. GitHub token falls back to `gh auth token`. `init` lets you pick the source; the TUI can publish a task as a linked GitHub issue and refine the description with AI (Ctrl+R, needs a claude agent).
```

- [ ] **Step 4: Push branch + open PR** — base `main`, body summarizing the change and `Closes #24`. Verify the PR exists with `gh pr view`.

---

## Self-Review

- **Spec coverage (RFC 0005):** schema optional+refine (T1), JSON-only/3-step (T2), runtime-guard rename+9 callers (T3), conditional provider+defaultSource (T4), gh token fallback (T5), schema notice (T6), init source selection (T7/T8), config.example.json + .gitignore (T12), compatibility/docs (T12). ✓
- **Goal coverage:** TUI manage/publish → sources fix (T7) + existing TaskForm/createTask; GitHub issue linking → existing `GitHubIssuesTaskProvider.createTask` (verified in T13 smoke + provider tests); AI refine description → T9/T10/T11. ✓ Deliverable = single PR (T13). ✓
- **Type consistency:** `assertRuntimeConfig` used identically in guard + 9 callers (T3); `runStructuredAi`/`extractClaudeStructured`/`stripCodeFences` signatures shared by complete.ts + refine service (T9/T10); `onRefineDescription` signature identical across TaskForm/App/tui (T11); `GlobalConfigInputs` shape consistent (T8). ✓
- **Placeholders:** none — concrete code/commands throughout. Two confirm-as-you-go notes (GitHub source const name in T4 Step 1; `globalConfigPath` dedupe in T2) are explicit verification steps, not deferred work.
- **Uncertainty → review:** before finalizing T4 (provider narrowing) and T9 (behavior-identical extraction), dispatch a review subagent per the goal directive.
