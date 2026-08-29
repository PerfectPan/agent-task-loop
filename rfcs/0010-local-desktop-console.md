# RFC 0010: Local-First Desktop Agent Task Loop Console

## Status

Proposed

## Evidence anchors

| Kind | Reference |
| --- | --- |
| Multica commit inspected | `e2f4f28462a5a5225e246cd7714a33e2b12bd18f` (clone of https://github.com/multica-ai/multica) |
| Multica docs | `apps/docs/content/docs/desktop-app.mdx`, `daemon-runtimes.mdx`, `how-multica-works.mdx`, root `CLI_AND_DAEMON.md`, `AGENTS.md` |
| Multica desktop code | `apps/desktop/` (Electron + electron-vite + electron-builder), `src/main/daemon-manager.ts`, `src/preload/index.ts`, `src/main/external-url.ts`, `electron-builder.yml` |
| Multica daemon code | `server/internal/daemon/health.go` (loopback health, unauthenticated local HTTP) |
| This repo domain | `CONTEXT.md`, `packages/agent-task-loop/src/task-manager/*`, `src/rivus-plugin.ts`, `src/tui/*`, RFC 0009 |
| Related draft (untouched) | `rfcs/0008-shared-session-infra.draft.md` (user local file; not modified by this work) |

**Observation vs inference legend used below**

- **Observed**: read from source or docs at the commit/path above.
- **Inferred**: design judgment for this repository, not a Multica or product claim.

---

## Summary

Add a **local-first desktop console** as an adapter over the existing
`agent-task-loop` application layer. Task Backend (Feishu / GitHub Issues)
remains the system of record for task business state. The console must not
become a second task system, cloud control plane, or model provider.

Recommended shape:

1. Export a stable application boundary from `@rivus/agent-task-loop`
   (shared with Rivus Plugin / CLI start path).
2. Add a new **app** at `apps/agent-task-loop-desktop` (workspace-private,
   not an npm library) that hosts a **loopback-only local application
   server** (HTTP + SSE) calling that boundary directly — never by shelling
   out to the CLI.
3. Ship a local Electron shell + thin UI that consume only redacted public
   DTOs. Local-operator use only; no third-party distribution, signing, or
   npm publish.
4. Keep Rivus Plugin authority unchanged: still exactly list / get / create /
   start Tools.

MVP is one vertical slice: list → detail → create → start, with poll/SSE
refresh, redaction tests, and app-boundary tests. Installer packaging,
complete/cancel product flows, raw log streaming, and auto-update are
explicitly deferred.

---

## Motivation

Today the product surface is CLI + Ink TUI + Rivus Plugin. The TUI
(`src/commands/tui.tsx`) already composes `TaskService` for list/create and a
filesystem session provider for previews, but it is terminal-bound, exposes
machine-local fields in the UI layer, and does not share the
`TaskManagerApplication` redaction boundary used by Rivus.

Operators want a desktop-shaped console for:

- scanning a board and filtering tasks
- creating and starting work without memorizing CLI flags
- watching agent / review progress while multiple tasks run
- seeing safe summaries of worktree / PR / failure state

Multica is a useful **packaging and process-lifecycle** reference (Electron
shell + managed local daemon + IPC), but its product boundary is different:
Multica Cloud/self-host server owns issues and the task queue; the local daemon
only executes agents (**Observed**: `how-multica-works.mdx`,
`daemon-runtimes.mdx`). This repository must keep external Task Backends as
SoR and local orchestration as adapter (**Observed**: README, CONTEXT.md,
RFC 0009).

---

## Goals

- Desktop console reuses `TaskManagerApplication`, `TaskService`,
  `TaskStartService`, `TaskProvider`, `ReviewLoopRunner` composition — not CLI
  subprocess automation.
- UI never receives raw provider responses, credentials, absolute machine
  paths, session/run/PID/trace, or raw terminal secrets.
- Rivus Plugin Tool set remains list/get/create/start only.
- Long-running Task Runs can outlive a closed UI window (local server process
  owns runners).
- Public repo hygiene: no private domains, tokens, or personal paths in tree.
- Test-first boundary coverage for the local API and redaction.

## Non-Goals

- Multica-like multi-tenant cloud control plane, workspaces, OAuth cloud login,
  or server-side agent execution marketplace.
- Expanding Rivus Plugin Tools (complete, reject, cleanup, watch, schema, …).
- Becoming a model supplier or embedding agent credentials in the UI.
- Full Electron/Tauri installers, code signing, and auto-update in MVP.
- Copying Multica's `webSecurity: false` / `sandbox: false` renderer posture
  (**Observed**: `apps/desktop/src/main/index.ts` `createRendererWebPreferences`).
- Replacing the Ink TUI or CLI.
- Implementing Raft-style shared collaborative control plane or Orca-style ADE
  product surface; those are auxiliary contrasts only.

---

## 1. User tasks and closed loops

### Core loops the desktop product should eventually support

| Loop | User intent | Authority | Desktop role |
| --- | --- | --- | --- |
| Board / filter / detail | Scan work across sources | Task Backend via `list`/`get` | Present `PublicTaskDto`; filter status/agent/source/text |
| Create | Publish a new task | Task Backend via `create` | Form → application `createTask` |
| Start / recover | Run execute→review loop | Local `TaskStartService` + Runner | Application `startTask` (includes stale recovery) |
| Resume | Continue after failure/stale | Same as start (liveness inspect) | Map UI “Resume” to `startTask`, not a second state machine |
| Complete / cancel | Close or stop work | Existing complete/reject/cleanup services | **Post-MVP**; permission model reserved, not implemented in MVP |
| Live agent / review state | See progress without secrets | Backend fields + local run-time overlay (RFC 0006 store) | Poll/SSE of public fields + coarse run phase |
| Worktree / branch / PR / failure | Diagnose delivery | Safe projections only | Show repo label, PR link, bounded summaries; never absolute paths/PID |
| Multi-task parallelism | Run several tasks | Runner + liveness | Surface “already active” conflicts as stable errors; optional concurrency hint |

### Permission model (product)

Desktop is a **local operator console** for the same machine identity that owns
`~/.agent-task-loop/config.json`. It is not a multi-user ACL system.

| Action | MVP | Who may call | Notes |
| --- | --- | --- | --- |
| list / get | yes | holder of local session token | observe |
| create | yes | holder of local session token | mutate backend |
| start (incl. recover) | yes | holder of local session token | mutates backend + spawns workers |
| complete / reject / cleanup | no | reserved | requires separate application ports + UX confirmations |
| stop runner | no | reserved | TUI has optional `onStopTask` hook but default TUI does not wire stop (**Observed**: `tui.tsx`) |
| edit raw config / tokens | no | out of band | use CLI `init` / `source` |

Rivus Plugin remains a **stricter** remote/agent-facing surface (four Tools).
Desktop may later expose more **local** operator actions without widening Plugin
Tools.

### Safe display allowlist

Reuse and extend only through mappers adjacent to `PublicTaskDto`
(`src/task-manager/public-task.ts`):

**Allowed**: `taskId`, `title`, `description`, `project`, `repository`, `source`,
`targetAgent`, `priority`, `status`, `progressSummary`, `resultSummary`,
`prLink`, `currentOwner`, review/acceptance rounds & verdicts, timestamps,
coarse `runPhase` (`idle` \| `starting` \| `running` \| `recovering` \|
`failed` \| `unknown`) derived without exposing PID.

**Denied**: `workspacePath`, log paths, session ids/names/history, `runId`,
`runnerPid`, heartbeat raw timestamps as process forensics, claim identity
internals, publish branch/commit raw if treated as machine-local, provider
payloads, config, tokens, `lastError` raw text (map to neutral
`failureCode` / bounded sanitized message only).

---

## 2. Architecture options

| Option | Fit to Node/Ink/TS stack | Packaging | Cross-platform | Native capability | Test cost | Security cost |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Electron app imports domain in main** | High TS reuse | Heavy (Chromium) | Strong | IPC, tray, autostart | E2E heavy | Large renderer attack surface; must lock preload |
| **B. Tauri shell + Node sidecar** | Domain stays Node; shell is Rust | Smaller binaries | Strong | Good OS integration | Split toolchain | Sidecar protocol must be authenticated |
| **C. TS local daemon (HTTP+SSE) + thin UI** | Best — pure Node composition | npm/CLI first; shell optional | UI is browser or later shell | Limited until shell added | **Lowest** for domain boundary tests | Loopback + token; no Chromium if headless |
| **D. Pure desktop shell IPC only (no HTTP)** | Good if Electron main hosts app | Same as A | Strong | IPC only | Harder headless CI without Electron | Avoids TCP, but UI death can couple to process design |

### Recommendation (**Inferred**)

**C first, with a documented path to A-as-shell.**

Rationale:

1. Domain already lives in TypeScript application services (RFC 0009).
2. Task Runs must survive UI close → need a process that is not the renderer.
3. Multica’s valuable pattern is “shell manages lifecycle of a separate local
   runtime,” not “UI owns the SoR” (**Observed**: desktop auto-starts daemon;
   server remains SoR).
4. HTTP+SSE on `127.0.0.1` is easy to test with Node `fetch` without launching
   Electron in CI.
5. Electron/Tauri can later be a **lifecycle + window** wrapper around the same
   local server (Multica-like `daemon-manager.ts`), without rewriting domain.

**Reject for MVP**: full Multica Electron product clone; Tauri+Rust domain
rewrite; UI shelling to `agent-task-loop` CLI.

---

## 3. Recommended architecture and trust boundaries

```text
                    ┌─────────────────────────────────────────┐
                    │ Desktop UI (web first / Electron later)  │
                    │  - board, detail, forms                 │
                    │  - holds only local session token       │
                    └─────────────────┬───────────────────────┘
                                      │ loopback HTTP + SSE
                                      │ Authorization: Bearer <local token>
                    ┌─────────────────▼───────────────────────┐
                    │ Local Application Server                │
                    │  apps/agent-task-loop-desktop           │
                    │  - authn token gate                     │
                    │  - input validation                     │
                    │  - DTO redaction / neutral errors       │
                    │  - SSE broadcaster (public events)      │
                    └─────────────────┬───────────────────────┘
                                      │ in-process calls only
                    ┌─────────────────▼───────────────────────┐
                    │ TaskManagerApplication (exported)       │
                    │  list / get / create / start            │
                    │  + TaskStartService / Liveness          │
                    └──────────────┬─────────────┬────────────┘
                                   │             │
                    ┌──────────────▼──┐   ┌──────▼──────────────┐
                    │ TaskProvider     │   │ ReviewLoopRunner    │
                    │ TaskService      │   │ Execution/Review    │
                    └──────┬───────────┘   └──────┬─────────────┘
                           │                      │
              ┌────────────▼──────────┐   ┌───────▼────────────┐
              │ Task Backend          │   │ External Worker    │
              │ Feishu / GitHub       │   │ claude/codex/… CLI │
              │ (business SoR)        │   │ worktree on disk   │
              └───────────────────────┘   └────────────────────┘

Config/credentials: ~/.agent-task-loop/config.json + env + gh/lark CLIs
  → readable only by Local Application Server / existing services
  → never sent to UI

Rivus Plugin (unchanged): same TaskManagerApplication, four Tools only
```

### Trust boundary rules

| Zone | May hold | Must not hold |
| --- | --- | --- |
| UI | session token, public DTOs, user form input | backend tokens, absolute paths, PID, raw logs |
| Local app server | config, credentials, runner handles, redaction | none of UI’s secrets beyond issuing session token |
| Task Backend adapters | backend API credentials | desktop session tokens |
| External workers | agent vendor auth on machine | task backend tokens unless already configured outside |
| Rivus Host | Deployment allowlist | TaskRecord internals |

Dependency direction (hard):

```text
UI → desktop local API client → desktop server handlers
  → @rivus/agent-task-loop/task-manager (application)
  → services / task-management / runners
```

No reverse imports from `agent-task-loop` into desktop UI packages.
Desktop must not depend on Rivus Plugin package surface for operator APIs.

---

## 4. Data flows

### 4.1 User starts a task

```text
UI POST /v1/tasks/:id/start { maxRounds?, targetAgent? }
  → validate + auth
  → TaskManagerApplication.startTask
  → TaskStartService (liveness inspect)
       active  → 409 conflict (stable code task-already-active)
       stale   → recover via ReviewLoopRunner resume/run
       idle    → ReviewLoopRunner.run
  → refresh TaskProvider.getTaskById
  → 200 { action, task: PublicTaskDto }
  → emit SSE task.updated { taskId, status, runPhase }
```

`startTask` today awaits the full review loop completion in
`TaskManagerApplication` (**Observed**: returns
`action: 'review-loop-completed'`). For desktop UX this is problematic: HTTP
would block for the entire agent run.

**MVP decision (Inferred)**: introduce an application-adjacent
`startTaskBackground` port used **only by the desktop local server**:

- performs the same preflight / liveness / kickoff as `TaskStartService`
- does **not** await full loop completion on the request path
- tracks in-memory run registry for SSE `runPhase`
- final authoritative status still comes from Task Backend refresh

This must not change Rivus Plugin semantics: Plugin `task-start` keeps awaiting
completion via existing `startTask`. Desktop does not widen Plugin Tools.

### 4.2 Runner lifecycle → UI refresh

```text
Runner updates TaskProvider (progress, review state, success/fail)
  → optional in-process hook / polling tick in local server
  → map to PublicTaskDto
  → SSE task.updated
UI merges by taskId (React Query-style or simple store)
```

MVP may poll Task Backend every N seconds inside the server and fan out SSE,
rather than instrumenting every runner callback (lower coupling).

### 4.3 Failure recovery

```text
UI start again on failed/stale task
  → same start endpoint
  → TaskStartService recovery paths (rework prompt / resumeReview)
  → neutral errors if backend/runner fails
```

### 4.4 Close desktop UI while tasks run

| Component | Semantics |
| --- | --- |
| UI window/tab closed | SSE disconnects; runs continue |
| Local app server process kept alive | runners continue; token still required on reconnect |
| Local app server stopped | best-effort: in-flight Node work may abort; backend retains last written status; stale PID recovery on next start via existing liveness |
| Machine reboot | same as CLI today |

MVP documents: **stopping the local server stops orchestration in this
process**; it is not a launchd/systemd supervised daemon yet (post-MVP).

---

## 5. Multica: borrow vs do not copy

Evidence base: commit `e2f4f28462a5a5225e246cd7714a33e2b12bd18f`.

### Borrow (patterns)

| Pattern | Evidence | How we use it |
| --- | --- | --- |
| Desktop is not SoR; local runtime executes agents | `how-multica-works.mdx`: server stores data; daemon runs tools locally | Keep Feishu/GitHub as SoR; local server runs `ReviewLoopRunner` |
| Shell manages local runtime lifecycle separately from UI | `desktop-app.mdx`; `daemon-manager.ts` starts/stops/polls health | Later Electron/CLI supervisor around our local server |
| Preload allowlist + `contextBridge` | `apps/desktop/src/preload/index.ts` | If/when Electron shell: expose minimal API only |
| Safe external URL open (http/https only) | `external-url.ts` + eslint ban on raw `shell.openExternal` | Same for PR links |
| Isolated desktop daemon profile vs manual CLI daemon | `desktop-app.mdx`: separate profile/runtimes | Optional later: profile dir under `~/.agent-task-loop/desktop/` so console server does not fight ad-hoc CLI experiments |
| Shared headless core vs app shells | Multica `packages/core` + `apps/web` + `apps/desktop` (`AGENTS.md`) | Our `task-manager` application + desktop adapter package |
| electron-builder packaging pitfalls documented in-tree | `electron-builder.yml` comments (dist exclusion, executableName) | Read before any packaging work |
| Message queue until renderer listeners ready | `main-renderer-messages.ts` | Only if Electron deep links added |

### Do not copy (product or security)

| Item | Evidence | Why not |
| --- | --- | --- |
| Cloud/self-host server as issue/task SoR + WS hub | `how-multica-works.mdx`, Go `server/` | Violates this repo’s Task Backend boundary |
| Daemon polls cloud task queue every 3s and claims work | `CLI_AND_DAEMON.md`, `daemon-runtimes.mdx` | Our tasks are not Multica queue items; operator starts explicitly |
| Unauthenticated loopback control endpoints | `health.go`: `/health`, `/shutdown`, `/repo/checkout` on `127.0.0.1` without token | We require local session token on all mutating and data APIs; health may be minimal and still token-gated or info-free |
| Renderer `webSecurity: false` + `sandbox: false` | `index.ts` `createRendererWebPreferences` | Unacceptable default for our MVP threat model |
| Embedding full CLI binary and auto-updating it from GitHub Releases | `daemon-manager.ts`, `cli-bootstrap.ts`, `electron-builder.yml` publish | Out of scope; we compose TS libraries |
| Multi-workspace tab groups, inbox, squads, billing, mobile | desktop docs + `packages/core` tree | Different product |
| Token sync from renderer into daemon config (`daemon:sync-token`) | preload `daemonAPI.syncToken` | Our UI must never handle backend PATs |
| Treating desktop as signed cloud client with deep-link auth | desktop auth session flow | Local operator console using existing file config |

### Auxiliary contrasts (not templates)

- **Raft-like systems**: shared collaborative control plane and Server/Computer
  split with message-uplink boundaries — useful vocabulary for “what stays
  local,” not a product to clone.
- **Orca-like systems**: local-first worktree/terminal/ADE and self-managed
  remote runtimes — useful for worktree UX inspiration; do not import their
  product boundary or remote runtime control plane.

---

## 6. MVP slice

### In scope

New app: `apps/agent-task-loop-desktop` (private workspace package name
e.g. `@rivus/agent-task-loop-desktop`, **not** published).

| Piece | Detail |
| --- | --- |
| Location | `apps/` (runnable app), not `packages/` (libraries) |
| Dependency | workspace dep on `@rivus/agent-task-loop` application export |
| Process | Electron main starts local server + window; optional `serve` for headless API tests |
| Bind | `127.0.0.1` only; ephemeral or configured port; refuse non-loopback |
| Auth | generate per-process session token (printed once / written to mode-0600 file under app state dir); `Authorization: Bearer` required |
| Routes | `GET /v1/health` (liveness, no secrets), `GET /v1/tasks`, `GET /v1/tasks/:id`, `POST /v1/tasks`, `POST /v1/tasks/:id/start`, `GET /v1/events` (SSE) |
| DTOs | `PublicTaskDto` + coarse `runPhase`; identical deny-list spirit as Rivus |
| UI | minimal board in Electron (list/filter/detail/create/start), same-origin to local server |
| Tests | fake `TaskManagerApplication`; auth failure; redaction adversarial record; start conflict; SSE event shape |
| Core export | `@rivus/agent-task-loop/task-manager` exporting application factory + types + errors (no config side effects on import) |

### Out of scope (MVP)

- Electron/Tauri packaging, code signing, auto-update
- complete / reject / cleanup / schema / source management UI
- raw log tail, transcript attach, absolute path reveal
- multi-user auth, remote access, TLS on LAN
- changing Rivus Plugin Tool set
- launchd/systemd service installers
- publishing desktop package to npm as part of this change set’s release
  automation (package may be `private: true` initially)

### Vertical slice acceptance

1. With a fake application backend, HTTP client can list/get/create/start and
   receive only public fields.
2. Adversarial `TaskRecord` fields never appear in JSON responses or SSE.
3. Unauthenticated requests fail closed.
4. `pnpm test` / `pnpm build` / `pnpm typecheck` green.
5. Desktop package `npm pack --dry-run` inspected; no credentials/paths.

---

## 7. Security model

| Topic | Rule |
| --- | --- |
| Bind address | `127.0.0.1` only; reject `0.0.0.0` / public interfaces |
| IPC/HTTP auth | Random session token ≥ 128 bits; required on API+SSE; not logged |
| Token storage | memory + optional `0600` file in app state dir; deleted on clean shutdown when possible |
| Credentials | stay in existing config loaders inside server process; never in UI bundles or SSE |
| Logs | structured server logs strip tokens, Authorization headers, absolute home paths; runner failures → neutral codes |
| Sensitive output | no raw agent stdout to UI in MVP |
| External links | open `http:`/`https:` only (Multica `external-url.ts` pattern) |
| Worktree paths | never return absolute paths; optional display of repo key / relative workspace label if already public |
| Process control | no arbitrary shell endpoint; only application ports |
| Auto-update | deferred; when added, signed artifacts only; no silent code exec from UI |
| CSRF | loopback + Bearer token (not cookie session) avoids classic browser CSRF |
| Browser origin | serve UI and API same origin; no CORS `*` |
| Plugin authority | unchanged; desktop local routes are not Rivus Tools |

Threat notes:

- Any local process can try loopback ports — token is mandatory (**stricter than
  Multica daemon health**).
- XSS in UI would steal only the local session token, not backend PATs, if
  redaction holds — still keep CSP tight when Electron arrives.

---

## 8. Testing, migration, risks, open questions, release

### Testing strategy

1. **Unit**: redaction mapper, auth middleware, run-phase mapping, port bind
   guard.
2. **Integration**: in-process server + fake `TaskManagerApplication`; real HTTP
   and SSE.
3. **Contract**: response JSON schema snapshots for public DTO.
4. **Package**: export surface test; `npm pack --dry-run` file list.
5. **Regression**: existing `agent-task-loop` Rivus/CLI tests remain green;
   Plugin still four Tools.
6. No personal config, no live Feishu/GitHub in CI.

### Migration path

| Stage | Deliverable |
| --- | --- |
| M0 | RFC + export `task-manager` + desktop local server MVP |
| M1 | Polished web UI parity with TUI board filters |
| M2 | Background start UX, multi-run dashboard, conflict toasts |
| M3 | Optional Electron shell lifecycle (Multica-like manager) |
| M4 | complete/reject/cleanup operator actions via new application ports |
| M5 | packaging/signing/auto-update if product requires installers |

CLI and TUI remain supported. No forced migration.

### Risks

| Risk | Mitigation |
| --- | --- |
| `startTask` currently awaits full loop | Desktop-only background kickoff port; Plugin unchanged |
| Leak of paths via error messages | Neutral `TaskManagerOperationError` mapping end-to-end |
| Port conflicts | configurable port; clear error; optional port `0` |
| Users treat desktop as remote server | docs + loopback enforcement |
| Scope creep toward Multica cloud | non-goals enforced in review |
| Dual composition roots drift | single exported `createConfiguredTaskManagerApplication` |

### Resolved decisions (2026-07-21)

1. **App location & visibility**: `apps/agent-task-loop-desktop`,
   workspace-private only. Local operator use; no npm publish, no external
   distribution, no signing/auto-update work in MVP.
2. **Desktop shell**: required for local use. MVP ships a minimal Electron
   window that hosts the local server + UI. Packaging for third parties is out
   of scope; `pnpm`/`electron` dev launch is enough.
3. **Failure display**: stable error `code` plus optional bounded sanitized
   `message` (no stacks, paths, tokens).
4. **SSE payload**: full public DTO on `task.updated` (same allowlist as GET).
5. **State dir**: `~/.agent-task-loop/desktop/` for session token file.
6. **Concurrent start**: share liveness with CLI; active runner → conflict.

### Remaining open questions

1. Is background start allowed to share process with CLI starts on the same
   machine beyond liveness (resource caps)? Defer until multi-run UX.

### Release strategy

- RFC lands first on a focused branch.
- Implementation: Changeset for any published package surface change
  (`agent-task-loop` new export = minor; desktop package private → maybe no
  publish).
- Do not npm publish as part of agent work.
- PR must include Multica evidence SHA, architecture decision, reused services,
  test commands output, residual risks.
- Pre-push: AGENTS.md public safety `rg` scan.

---

## App sketch (MVP)

```text
packages/agent-task-loop/
  src/task-manager/*          # existing
  export ./task-manager       # NEW subpath

apps/agent-task-loop-desktop/   # runnable app under apps/, not packages/
  package.json                # private: true
  src/
    server/
      create-server.ts        # node:http
      auth.ts
      routes.ts
      sse.ts
      redact.ts               # assert/allow public fields only
      background-start.ts     # non-blocking kickoff adapter
    electron/
      main.ts                 # start server + BrowserWindow
      preload.ts              # minimal allowlist if needed
    ui/                       # minimal board
    cli.ts                    # optional headless serve for tests
  tests/
    server.auth.test.ts
    server.tasks.test.ts
    server.redaction.test.ts
    server.sse.test.ts
```

---

## Alternatives considered

1. **Electron-only MVP** — rejected: slow CI, high surface, delays proving
   domain boundary.
2. **CLI subprocess from UI** — rejected: RFC 0009 already rejected for Rivus;
   same reasons (parsing, leaks, unstable errors).
3. **Expand Rivus Plugin instead of desktop package** — rejected: Plugin is
   least-authority agent-facing; desktop is local operator-facing.
4. **Put HTTP server inside `@rivus/agent-task-loop` core package** — rejected:
   keeps publish surface narrow; desktop is an app adapter under `apps/`.
5. **Put desktop under `packages/`** — rejected: it is a runnable local app
   (like `apps/web`), not a reusable library.
5. **Full Multica daemon port (Go)** — rejected: wrong SoR and stack.

---

## Compatibility

- No change to CLI flags required for MVP.
- New optional export on `@rivus/agent-task-loop`.
- Rivus Plugin behavior unchanged.
- Config file format unchanged.

---

## Implementation checklist (after RFC approval)

1. Export `task-manager` application API from core package + tests/changeset.
2. Desktop package: auth + routes + redaction + background start + SSE.
3. Failure-first tests at HTTP boundary.
4. Minimal UI or documented HTTP-only MVP with a tiny static board.
5. `pnpm test && pnpm build && pnpm typecheck` + pack dry-run + public scan.
6. PR with evidence sections.

---

## Appendix A: Observed Multica architecture (condensed)

```text
Renderer (React, shared views/core)
  --IPC preload allowlist--> Electron main
       |-- manages window, updater, external URLs
       |-- daemon-manager spawns embedded `multica` CLI daemon profile
       |-- polls http://127.0.0.1:{healthPort}/health
Daemon (Go)
  --HTTPS/API + poll--> Multica server (issue/task SoR, WS)
  --spawns--> local AI CLIs in workspaces root
```

Desktop defaults to Multica Cloud API; self-host via `~/.multica/desktop.json`
(**Observed**: `desktop-app.mdx`).

## Appendix B: This repo target architecture (condensed)

```text
UI
  --Bearer loopback HTTP/SSE--> Local TS Application Server
  --in-process--> TaskManagerApplication
  --TaskProvider--> Feishu/GitHub (task SoR)
  --Runner--> local coding agent CLIs
```

No cloud task queue. No UI-held backend secrets.
