# Handoff prompt: implement RFC 0010 desktop console MVP

Copy everything below the line into a new agent session.

---

## Mission

Implement the **local-first desktop Agent Task Loop console** per
`rfcs/0010-local-desktop-console.md` in this monorepo.

Primary domain package: `packages/agent-task-loop`.
Desktop **app** location: `apps/agent-task-loop-desktop` (not under `packages/`).

Do **not** modify `rfcs/0008-shared-session-infra.draft.md` (user local draft).

## FIRST: open an isolated git worktree (required)

Do **not** implement in a random dirty checkout. Create/use a dedicated worktree
for this branch, then do all work there.

```bash
# 0) Discover repo root and existing worktrees
git rev-parse --show-toplevel
git worktree list
git status -sb
git branch -a | rg 'desktop-console|main' || true

# 1) Prefer a sibling worktrees dir (adjust if the machine already uses one)
REPO_ROOT="$(git rev-parse --show-toplevel)"
WT_ROOT="$(dirname "$REPO_ROOT")/atl-worktrees"
mkdir -p "$WT_ROOT"
WT_PATH="$WT_ROOT/desktop-console"

# 2) If worktree already exists, just enter it
if git worktree list | rg -q "$WT_PATH"; then
  cd "$WT_PATH"
else
  # 3) Ensure branch exists
  #    - If feat/desktop-console already exists (possibly with WIP), use it.
  #    - Else create it from origin/main (or main).
  git fetch origin 2>/dev/null || true
  if git show-ref --verify --quiet refs/heads/feat/desktop-console; then
    git worktree add "$WT_PATH" feat/desktop-console
  elif git show-ref --verify --quiet refs/remotes/origin/main; then
    git worktree add -b feat/desktop-console "$WT_PATH" origin/main
  else
    git worktree add -b feat/desktop-console "$WT_PATH" main
  fi
  cd "$WT_PATH"
fi

# 4) Confirm isolation
pwd
git branch --show-current   # expect: feat/desktop-console
git status -sb
git worktree list

# 5) Install deps in THIS worktree
pnpm install
```

Rules:

- All subsequent commands, edits, tests, commits, and `gh pr create` run **inside
  `$WT_PATH`**, not the original checkout.
- If the original tree already has uncommitted RFC/WIP on `feat/desktop-console`,
  the new worktree shares that branch tip — `git status` there; continue or
  commit carefully. Do **not** force-reset user WIP.
- Never `git worktree remove` other agents’ worktrees.
- Do not commit `rfcs/0008-shared-session-infra.draft.md` even if it appears
  untracked in another checkout.

After the worktree is ready, set working directory to that path for the rest of
the session.

## Already done (do not redo blindly; verify and continue)

Branch: `feat/desktop-console` (create via worktree steps above if missing).

Partial WIP may already exist:

| Path | State |
| --- | --- |
| `rfcs/0010-local-desktop-console.md` | Full RFC — **source of truth** |
| `rfcs/0010-handoff-prompt.md` | This handoff |
| `packages/agent-task-loop/src/task-manager/index.ts` | Barrel export draft |
| `packages/agent-task-loop/src/task-manager/task-manager-error.ts` | May add `task-already-active` |
| `packages/agent-task-loop/src/task-manager/task-start-service.ts` | May throw `TaskManagerInputError('task-already-active')` instead of generic Error |

Still missing: package.json `exports` for `./task-manager`, rslib entry, desktop app, tests, changeset, PR.

## Hard domain boundaries (must not break)

1. **Task Backend remains SoR** (Feishu / GitHub Issues). Desktop must not copy or redefine provider task state.
2. **Reuse** `TaskManagerApplication`, `TaskService`, `TaskStartService`, `TaskProvider`, `ReviewLoopRunner` via in-process calls. **Never** shell out to `agent-task-loop` CLI for business ops.
3. **Rivus Plugin** stays exactly four Tools: list / get / create / start. Do not expand Plugin authority for desktop features.
4. **Do not expose to UI**: raw provider responses, credentials, absolute machine paths, session/run/PID, trace, raw sensitive terminal output.
5. Desktop is an **adapter**, not a new task system, cloud control plane, or model vendor.

## Product decisions already locked

- App path: `apps/agent-task-loop-desktop` (`private: true` workspace package).
- Local operator use only — **no npm publish**, no signing, no auto-update, no third-party installer work.
- Electron shell **is required** for local use (main starts loopback server + window).
- Loopback HTTP + SSE + Bearer session token (stricter than Multica’s unauthenticated daemon health).
- SSE carries **full public DTO** on `task.updated`.
- State dir: `~/.agent-task-loop/desktop/` for session token file (mode `0600`).
- Desktop start is **background** (HTTP must not await full review loop). Rivus Plugin `task-start` keeps awaiting completion via existing `startTask`.
- Failure responses: stable `code` + optional bounded sanitized `message`.

## Multica evidence (reference only; do not clone product boundary)

Inspected commit: `e2f4f28462a5a5225e246cd7714a33e2b12bd18f`  
Repo: https://github.com/multica-ai/multica  

**Borrow:** separate local runtime from UI; preload allowlist; http(s)-only external open; app under `apps/`, libraries under `packages/`.  
**Do not copy:** cloud task SoR, unauthenticated loopback control, `webSecurity: false` / `sandbox: false` as default, renderer-held backend PATs.

## Implementation plan (TDD)

### 1) Core export `@rivus/agent-task-loop/task-manager`

- Export application factory, types, errors, `toPublicTask`, `createConfiguredTaskManagerApplication`, contracts as needed.
- Update `packages/agent-task-loop/package.json` `exports`.
- Update `rslib.config.ts` entry if required for dist.
- Update `tests/package-surface.test.ts`.
- Ensure import has **no** config/network side effects until factory is called.
- Add/adjust unit tests for `task-already-active` if liveness mapping is kept.
- Changeset: **minor** on `@rivus/agent-task-loop` if public export is added.

### 2) App `apps/agent-task-loop-desktop`

Suggested layout:

```text
apps/agent-task-loop-desktop/
  package.json          # private: true, name @rivus/agent-task-loop-desktop
  src/server/           # create-server, auth, routes, sse, background-start, redact
  src/electron/         # main.ts (+ preload if needed)
  src/ui/               # minimal board: list/filter/detail/create/start
  src/cli.ts            # optional headless serve for tests
  tests/                # HTTP boundary tests with fake TaskManagerApplication
```

Server routes:

- `GET /v1/health` — no secrets
- `GET /v1/tasks` — query: status, targetAgent, limit
- `GET /v1/tasks/:id`
- `POST /v1/tasks` — create
- `POST /v1/tasks/:id/start` — background kickoff
- `GET /v1/events` — SSE

Security:

- Bind `127.0.0.1` only
- Bearer token on API + SSE
- Same-origin UI; no CORS `*`
- Redact with same allowlist spirit as `PublicTaskDto`
- Coarse `runPhase`: `idle | starting | running | recovering | failed | unknown` (no PID)

Electron:

- Main process owns server lifecycle and window
- Prefer secure defaults (`contextIsolation`, no nodeIntegration in renderer)
- Local dev launch via pnpm script is enough (no electron-builder release pipeline)

Dependency direction (hard):

```text
UI → local API client → server handlers → @rivus/agent-task-loop/task-manager → services
```

No reverse imports from core into the app’s UI layer for secrets.

### 3) Tests first at the real boundary

Write failing tests, then implement:

1. Unauthenticated request → 401
2. Adversarial task record (paths, PID, session, lastError, tokens) never appears in JSON/SSE
3. list / get / create / start happy paths via fake application
4. start when already active → conflict (`task-already-active` / 409)
5. start HTTP returns without waiting for full loop completion
6. SSE `task.updated` shape uses public fields only

No personal config, no live Feishu/GitHub in CI.

### 4) Wire monorepo

- `pnpm-workspace.yaml` already includes `apps/*`
- App scripts: `test`, `typecheck`, `build`/`dev` as appropriate
- Root `pnpm test` / `pnpm build` / `pnpm typecheck` must pass

## Final delivery checklist (definition of done)

Ship is **not** done until every box is true:

| # | Deliverable | Done when |
| --- | --- | --- |
| 1 | RFC | `rfcs/0010-local-desktop-console.md` present; paths say `apps/agent-task-loop-desktop` |
| 2 | Core export | `@rivus/agent-task-loop/task-manager` works after build; package-surface test updated |
| 3 | Desktop app | `apps/agent-task-loop-desktop` exists, `private: true`, Electron + loopback server + minimal UI |
| 4 | Vertical slice | list / get / create / start + SSE refresh, redacted DTOs only |
| 5 | Tests | HTTP-boundary tests (auth, redaction, conflict, background start) green |
| 6 | Monorepo verify | root `pnpm test`, `pnpm build`, `pnpm typecheck` all green — paste **raw command output** |
| 7 | Pack dry-run | if `packages/agent-task-loop` public surface changed: `npm pack --dry-run` inspected |
| 8 | Public safety scan | AGENTS.md `rg` clean (no `/Users/`, tokens, private domains) |
| 9 | Changeset | minor for `@rivus/agent-task-loop` if export added; desktop app private → no publish changeset required |
| 10 | Git | focused branch, signed commits preferred, **do not commit** `0008-*.draft.md` or secrets |
| 11 | PR | opened with required sections below + PR URL |
| 12 | Final report | Observed / Inferred / Implemented / Not implemented |

**Explicitly not required for done:** npm publish, signed installers, auto-update, complete/cancel UI, expanding Rivus Plugin tools.

---

## How to test

### A. Automated (required before claiming done)

From repo root:

```bash
pnpm install
pnpm test
pnpm build
pnpm typecheck
```

Package-scoped (also run if root scripts skip the new app):

```bash
pnpm --filter @rivus/agent-task-loop test
pnpm --filter @rivus/agent-task-loop typecheck
pnpm --filter @rivus/agent-task-loop-desktop test
pnpm --filter @rivus/agent-task-loop-desktop typecheck
```

If core package exports changed:

```bash
cd packages/agent-task-loop
npm pack --dry-run --registry=https://registry.npmjs.org
# Inspect file list: must include new dist task-manager entry if exported; must NOT include config secrets, home paths, workspaces
```

Public safety (AGENTS.md):

```bash
rg --hidden --no-ignore -n "internal-domain.example|/Users/|private-token|secret" . \
  --glob '!node_modules/**' \
  --glob '!packages/agent-task-loop/node_modules/**' \
  --glob '!.git/**'
```

**Evidence rule:** any claim “tests passed / build ok / fixed” must include the actual command output (or a clear “未验证” if a command could not run).

### B. Manual smoke (local desktop; required for “desktop works”)

Prereq: machine has Node 20+, pnpm; optional real `~/.agent-task-loop/config.json` for end-to-end against live backends. CI must use **fakes**, not personal config.

```bash
# Dev launch (script name may vary; document the real one in app README)
pnpm --filter @rivus/agent-task-loop-desktop dev
# or: electron entry that starts server + window
```

Manual checklist:

1. App window opens; UI loads from loopback origin only.
2. Board lists tasks (fake or real backend).
3. Open detail — no absolute paths / PID / session ids / raw errors with secrets.
4. Create task → appears after refresh/SSE.
5. Start task → HTTP returns quickly (not blocked for full agent run); UI shows coarse `runPhase` / status updates via SSE or poll.
6. Second start on active task → conflict, not a second runner.
7. Close window while a background run is in progress (if server lives in main process, document whether run continues; match RFC §4.4).
8. Request without Bearer token → 401.

Optional headless API-only smoke (if `serve` CLI exists):

```bash
pnpm --filter @rivus/agent-task-loop-desktop exec node dist/cli.js serve --port 0
# curl with Authorization: Bearer <token> against printed base URL
```

### C. What “good” test code looks like

- Prefer **in-process HTTP** against `createLocalServer({ application: fake })` — not Electron E2E in CI for MVP.
- One adversarial `TaskRecord` with every denied field; assert JSON/SSE keys allowlist.
- Assert start handler does not await a slow fake runner (e.g. runner resolves after 5s; HTTP returns in <500ms).

---

## How to commit and open PR

### Branch

```bash
git status -sb
# Stay on feat/desktop-console or recreate from main:
# git checkout main && git pull && git checkout -b feat/desktop-console
```

**Do not commit:**

- `rfcs/0008-shared-session-infra.draft.md` (user local draft)
- tokens, local config, `node_modules`, machine paths, generated logs

### Commits (conventional, signed preferred)

Suggested split (adjust if squash is preferred):

```bash
# 1) RFC only (if not already on remote)
git add rfcs/0010-local-desktop-console.md rfcs/0010-handoff-prompt.md
git commit -S -m "docs: add RFC 0010 local desktop console"

# 2) core export
git add packages/agent-task-loop .changeset
git commit -S -m "feat(agent-task-loop): export task-manager application boundary"

# 3) desktop app
git add apps/agent-task-loop-desktop
git commit -S -m "feat(desktop): local loopback console MVP"
```

If `git commit -S` fails (no GPG/SSH signing), use unsigned commits and note it in the PR; do not force or amend others’ history.

### Push and PR

```bash
git push -u origin HEAD

# GitHub CLI example — use the real default branch name (main)
gh pr create --title "feat: local desktop Agent Task Loop console (RFC 0010)" --body "$(cat <<'EOF'
## Summary

Local-first desktop console for agent-task-loop (RFC 0010).

- App: `apps/agent-task-loop-desktop` (private, local use only — not published)
- Core: export `@rivus/agent-task-loop/task-manager`
- Loopback HTTP + SSE + Bearer token; Electron shell for local UI
- Reuses TaskManagerApplication / TaskStartService / TaskProvider / ReviewLoopRunner in-process (no CLI shell-out)
- Rivus Plugin tools unchanged (list/get/create/start only)

## Multica evidence

- Commit inspected: `e2f4f28462a5a5225e246cd7714a33e2b12bd18f`
- Borrowed: app under `apps/`, separate local runtime from UI, safe external URL pattern, preload allowlist idea
- Rejected: cloud task SoR, unauthenticated loopback control APIs, webSecurity/sandbox disabled defaults, renderer-held backend PATs

## Architecture

- UI → loopback API → desktop server → `@rivus/agent-task-loop/task-manager` → existing services
- Task Backend remains system of record
- Desktop start is background; Plugin start semantics unchanged

## Reused services

- TaskManagerApplication, TaskStartService, TaskService/TaskProvider, ReviewLoopRunner, PublicTaskDto redaction

## Test plan / results

Commands run (paste output in PR or as comment):

- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `npm pack --dry-run` (agent-task-loop)
- [ ] AGENTS.md public safety `rg`
- [ ] Manual desktop smoke (list/create/start/SSE/401)

## Not in this PR

- complete/reject/cleanup UI
- installers / signing / auto-update / npm publish of desktop
- Rivus Plugin tool expansion
- raw log/transcript streaming

## Risks / follow-ups

- <fill: e.g. background start vs process lifetime, multi-run caps>

EOF
)"
```

After PR opens, print the **PR URL** in the final report.

### PR body must answer (CONTRIBUTING.md)

1. What changed?  
2. Why?  
3. How tested? (commands + results)  
4. Follow-ups?

Plus Multica SHA, architecture, reused services, residual risks.

---

## Final report format (required at end of agent session)

```markdown
## Observed source facts
- ...

## Design inferences
- ...

## Implemented
- ...

## Not implemented
- ...

## Verification
- pnpm test: <pass/fail + brief>
- pnpm build: ...
- pnpm typecheck: ...
- npm pack --dry-run: ...
- public safety rg: ...
- manual smoke: ...

## PR
- URL: ...
- Branch: ...
```

---

## Out of scope

- Expanding Rivus Plugin tools
- Cloud control plane / Multica-like task queue
- complete / reject / cleanup UI
- Raw log/transcript streaming
- npm publish of desktop app
- Code signing / auto-update
- Editing `rfcs/0008-shared-session-infra.draft.md`

## Read first

1. `AGENTS.md`, `CONTRIBUTING.md`, `CONTEXT.md`
2. `rfcs/0010-local-desktop-console.md` (full)
3. `rfcs/0009-rivus-task-manager-plugin.md` (boundary precedent)
4. `packages/agent-task-loop/src/task-manager/*`
5. `packages/agent-task-loop/src/rivus-plugin.ts`
6. `packages/agent-task-loop/src/commands/tui.tsx` (current UI composition; do not copy unsafe fields)

Start by: **open git worktree** (section FIRST) → `git status -sb` in that
worktree → read the RFC → TDD from core export → server tests → Electron/UI →
verify → PR from the worktree.
