# RFC 0010: Agentic Task Team Runtime

## Status

Draft

## Summary

Reposition `agent-task-loop` from a fixed execute→review→rework→publish
workflow engine into an **agentic multi-agent task team runtime** that treats
**Claude, Codex, OpenCode, and Grok** as first-class **Coding Providers**.

The product identity becomes:

1. a team of **role agents** (lead / implementer / reviewer / …),
2. a shared **Task World**,
3. a **provider registry** that binds roles to concrete coding CLIs,
4. a boring **runtime** for isolation, budgets, sessions, and recovery.

The current `ReviewLoopService` is demoted to a **default team policy shim**
(and eventually optional), not the system core. Today’s closed
`targetAgent ∈ {claude,codex,coco,glm}` enum is replaced by an open
**CodingProviderId** registry with a stable support matrix.

This RFC is the product contract for path **B** (multi-agent team) plus the
multi-provider execution layer, not a line-by-line implementation plan.

## Motivation

Today the package is workflow-shaped and provider-narrow:

- `ReviewLoopService` owns the next step (`while` execute → review → rework).
- Coding agents are External Workers spawned with pre-built prompts.
- Collaboration is side-channel fields (`resultSummary`, `sessionHistory`) plus
  prompt stitching, not agent-to-agent communication.
- Provider identity is a hard-coded four-value enum; reviewer is fixed to
  `codex`; OpenCode/Grok are not executable providers in the loop.
- Discovery (`agent-finder`) already knows many hosts (including OpenCode /
  Claude / Codex), but the loop does not consume a capability-aware registry.

The intended product is agentic **and** multi-provider:

- Roles decide what to do next within a bounded action space.
- Each role is backed by a **Coding Provider** (or an in-process lead brain).
- Claude / Codex / OpenCode / Grok are interchangeable where capabilities allow,
  and honestly degraded where they do not (e.g. resume, structured review).
- Task Backend remains system of record for business task fields.
- Runtime stays boring: process/worktree isolation, liveness, budgets, grants.

Without this split, higher-level “harness” work keeps re-wrapping a SOP engine
and never becomes a multi-CLI team runtime.

## Non-goals (v1 of this direction)

- Free-form multi-agent chat with no task binding.
- Moving Task Backend authority into Rivus Memory.
- Replacing Feishu/GitHub as systems of record.
- Fully distributed FIPA/JADE ACL stacks.
- Making every coding CLI a first-class Rivus peer in v1.
- Deleting CLI `start` compatibility in the first cut.
- Supporting the full `agent-finder` catalog as execute targets on day one
  (Cursor IDE, Windsurf UI, etc. remain discovery-only until they expose a
  headless unit contract).
- Perfect feature parity across all four CLIs on day one (parity is a matrix,
  not a lie).

## Product identity

| Term | Meaning | Avoid calling it |
| --- | --- | --- |
| **Task Team** | Bound set of role agents working one Task Run | Workflow, pipeline |
| **Role Agent** | Team identity: goal, tools, inbox, budget | Worker script, step |
| **Coding Provider** | Headless coding CLI/runtime used to run a unit (claude, codex, opencode, grok, …) | Role, model name alone |
| **Provider Adapter** | Package code that knows how to spawn/parse/resume one provider | Team policy |
| **Task World** | Observable shared facts for a task (backend + run projection) | Hidden loop locals |
| **Message** | Agent-to-agent communication unit | Prompt override string |
| **Runtime** | Scheduler, isolation, recovery, grants, budgets, provider spawn | Business next-step owner |
| **Team Policy** | Optional default behavior (e.g. classic review loop) | Core engine |

Domain language from `CONTEXT.md` stays, with additions:

- **Task Team Run**: one Task Run executed by a Task Team.
- **Unit**: one provider invocation bound to a role (implement unit, review
  unit, …). Replaces the vague “round” as the execution atom; rounds remain an
  audit counter if useful.
- **SessionRef**: opaque provider session identity `{ providerId, sessionId,
  sessionName? }` — never assume UUID shape (OpenCode uses `ses_…`).

### Orthogonal IDs (do not collapse these)

| ID space | Examples | Owned by |
| --- | --- | --- |
| **RoleId** | `lead`, `implementer`, `reviewer` | Team runtime |
| **CodingProviderId** | `claude`, `codex`, `opencode`, `grok` (+ legacy `coco`, `glm`) | Provider registry in agent-task-loop |
| **FinderProviderId** | `claude-code`, `codex`, `opencode`, … | `agent-finder` catalog |
| **AgentKind** (sessions) | `claude`, `codex`, `opencode`, `unknown` | `agent-sessions` |

Mapping is explicit and one-way where needed:

```text
CodingProviderId "claude"  → FinderProviderId "claude-code"
CodingProviderId "codex"   → FinderProviderId "codex"
CodingProviderId "opencode"→ FinderProviderId "opencode"
CodingProviderId "grok"    → FinderProviderId TBD / config-only until catalog lands
```

Task fields today use `targetAgent`; that becomes **default implementer
CodingProviderId** (compat alias), not “the only agent in the system”.

## Default team (v1)

Default delivery team for `start`:

| Role ID | Responsibility | Default provider binding |
| --- | --- | --- |
| `lead` | Goal keeper: observe world, assign work, decide escalate/publish/fail | In-process policy/LLM (**not** required to be a coding CLI in v1) |
| `implementer` | Change code / produce artifacts | Task’s `targetAgent` / start override → one of claude\|codex\|opencode\|grok |
| `reviewer` | Critique artifacts; request rework or approve | Config `team.roles.reviewer.provider` (default `codex` for compat; **not** hardcoded in code paths) |

Optional later roles: `researcher`, `publisher`, `integrator`, human-proxy.

Human is not a role agent by default; human entry is:

- CLI/TUI actions (`complete`, `reject`, resume), and/or
- Rivus Endpoint bound to `lead` or a dedicated `human-bridge` later.

### Role cardinality (v1)

- One `lead` per Task Team Run.
- One active `implementer` unit at a time (parallel implementers = later).
- One `reviewer` unit per review request (re-invokable; provider selectable).

### Example team bindings

```json
{
  "team": {
    "policy": "classic-delivery",
    "roles": {
      "lead": { "kind": "in-process", "brain": "rules" },
      "implementer": { "kind": "coding-provider", "provider": "claude" },
      "reviewer": { "kind": "coding-provider", "provider": "codex" }
    }
  }
}
```

Alternate:

```json
{
  "team": {
    "roles": {
      "implementer": { "provider": "opencode" },
      "reviewer": { "provider": "grok" }
    }
  }
}
```

Per-task override still wins for implementer (today’s `targetAgent` /
`task-start --targetAgent`). Reviewer override is config- or lead-tool-level,
not silently fixed to codex.

## Coding Provider layer (Claude / Codex / OpenCode / Grok)

This is the multi-CLI spine. Team roles **use** providers; they are not the
same thing.

### First-class provider set (product target)

| CodingProviderId | Intended host surface | Status today in loop | Notes |
| --- | --- | --- | --- |
| `claude` | Claude Code CLI | Adapter exists | Finder id `claude-code` |
| `codex` | OpenAI Codex CLI | Adapter exists; default reviewer | Session parse differs from Claude |
| `opencode` | OpenCode CLI | Discovery + sessions research only | Sessions are SQLite `ses_…`, not JSONL UUID |
| `grok` | Grok coding CLI / headless agent entry | **Not in loop yet** | Must land as adapter + config; do not pretend enum equality without spawn contract |

Legacy (keep working, not the marketing four):

| Id | Notes |
| --- | --- |
| `coco` | Existing adapter; remains in registry |
| `glm` | Existing adapter; remains in registry |

Adding a provider never requires a core state-machine change—only a registry
entry + adapter + capability flags.

### Capability model

Providers are not assumed equal. Each registers capabilities:

```ts
type ProviderCapability =
  | 'unit.execute'          // spawn with prompt in a workspace
  | 'unit.resume'           // continue an existing SessionRef
  | 'unit.cancel'           // best-effort kill
  | 'progress.stream'       // heartbeat / partial progress callbacks
  | 'session.detect'        // emit SessionRef from stdout/logs
  | 'session.list_local'    // via agent-sessions provider
  | 'output.structured_json'// reliable machine-readable final payload
  | 'review.verdict_json'   // suitable for default structured reviewer prompts
  | 'workdir.explicit'      // accepts explicit cwd/workspace flag
  | 'env.inject';            // accepts env overlay safely

type CodingProviderDescriptor = {
  id: CodingProviderId;
  finderId?: string;           // agent-finder catalog id when known
  displayName: string;
  adapter: ProviderAdapter;
  capabilities: ProviderCapability[];
  sessionKind: 'uuid-jsonl' | 'opencode-sqlite' | 'opaque' | 'none';
  /** How missing caps are handled when a role requests them */
  degradation: 'reject' | 'fallback-prompt' | 'fallback-provider';
};
```

#### Target support matrix (design intent)

| Capability | claude | codex | opencode | grok |
| --- | --- | --- | --- | --- |
| `unit.execute` | required | required | required | required |
| `workdir.explicit` | yes | yes | yes (must verify CLI) | yes (must verify) |
| `progress.stream` | yes (JSON stream) | partial | TBD | TBD |
| `session.detect` | yes | yes | yes (`ses_…`) | TBD |
| `unit.resume` | goal | goal | goal (spike-gated) | goal |
| `session.list_local` | via agent-sessions | via agent-sessions | SQLite provider | TBD |
| `review.verdict_json` | yes | yes (current default) | yes if stdout controllable | yes if controllable |
| `output.structured_json` | preferred | preferred | preferred | preferred |

**Rule:** Team tools declare **required capabilities**. Runtime selects a
provider that satisfies them, or fails with a stable error
(`provider-capability-missing`) instead of spawning and hoping.

Examples:

- `unit.run_implement` requires `unit.execute` + `workdir.explicit`.
- `unit.run_review` with structured verdict requires
  `unit.execute` + `review.verdict_json` (or lead accepts free-text review via
  `fallback-prompt`).
- `unit.resume` requires `unit.resume`; if missing, lead gets a message and
  may re-assign a fresh unit instead of crashing the team run.

### Provider Adapter contract (evolution of `AgentAdapter`)

Today `AgentAdapter.execute` is a single method with command/args injected
from config. Keep that working, but evolve toward:

```ts
type SessionRef = {
  providerId: CodingProviderId;
  sessionId: string;
  sessionName?: string;
};

type UnitRequest = {
  taskId: string;
  roleId: RoleId;
  workspacePath: string;
  cwd: string;
  prompt: string;
  sessionName?: string;
  resume?: SessionRef;
  timeoutMs?: number;
};

type UnitResult = {
  status: 'success' | 'failure' | 'cancelled';
  summary: string;
  session?: SessionRef;
  structured?: unknown;      // optional parsed JSON
  error?: string;
  // workspacePath/prLink remain optional projections
  workspacePath?: string;
  prLink?: string;
};

interface ProviderAdapter {
  readonly id: CodingProviderId;
  execute(req: UnitRequest, hooks: UnitHooks): Promise<UnitResult>;
  resume?(req: UnitRequest, hooks: UnitHooks): Promise<UnitResult>;
  /** Optional: normalize provider stdout into structured review payload */
  parseStructured?<T>(raw: string): T | undefined;
}
```

Config still supplies `command` / `args` / `env` per provider instance; the
adapter owns CLI dialect (Claude stream-json vs `codex exec` vs OpenCode
invocation vs Grok).

### Discovery integration (`agent-finder`)

At team start / doctor:

1. Resolve configured providers from app config.
2. Optionally probe host via `agent-finder` using `finderId` mapping.
3. Mark provider instance `available | missing | degraded` with evidence.
4. Lead/tools can `world.observe` availability; assignment fails closed if the
   chosen implementer is missing (unless auto-fallback is configured).

```text
config agents.claude.command
        + finder probe(claude-code)
        → ProviderInstance { id, path, version, caps, status }
```

Doctor UX should answer: “Can this machine run implementer=opencode,
reviewer=codex?” with per-cap notes—not only “is binary on PATH”.

### Sessions (`agent-sessions`) and OpenCode

Session identity must stay provider-scoped:

- Claude/Codex: JSONL / UUID-oriented paths (existing work).
- OpenCode: SQLite `opencode.db`, ids `ses_…` (already documented in
  sessions plans)—**separate SessionProvider**, never forced through the
  UUID+jsonl indexer.
- Grok: unknown until adapter spike; default `sessionKind: 'opaque'`.

`sessionHistory` entries should store **SessionRef**, not bare ids:

```text
round=3 | kind=implement | role=implementer | provider=opencode | session=ses_… | id=…
```

TUI session preview resolves via the provider’s SessionProvider. Missing
provider ⇒ show “transcript unavailable”, not a parse crash.

### Grok-specific design notes

`grok` is a **product-required** CodingProviderId. Headless contract confirmed
(2026-08-15 spike on a local install): `grok -p <prompt> --output-format json`
runs a single-turn unit in the process cwd and prints one JSON object
`{ text, stopReason, sessionId, … }`; `--json-schema` constrains structured
output; `--resume <sessionId>` continues a session. Implementation proceeds as:

1. ~~Spike~~ done — adapter landed on `-p` + `--output-format json`.
2. ~~Land `grokAdapter` behind `ProviderAdapter`~~ landed behind the existing
   `AgentAdapter` interface (`src/adapters/grok.ts`).
3. Register capabilities honestly: proven today are `unit.execute`,
   `session.detect` (JSON `sessionId`), `workdir.explicit` (via cwd);
   `unit.resume` proven at CLI level, not yet wired.
4. Add finder catalog entry when install paths stabilize; until then config
   `command` is sufficient.

Do not block Claude/Codex/OpenCode team runtime on Grok parity—but do not leave
`grok` as a string alias to another provider.

### Role × provider selection rules

| Decision | Owner |
| --- | --- |
| Default implementer provider | Task `targetAgent` / create input / source default |
| Override implementer at start | CLI flag / `task-start` optional field |
| Default reviewer provider | App config `team.roles.reviewer.provider` |
| Switch reviewer mid-run | Lead tool `unit.run_review { provider? }` within allowlist |
| Lead brain | Config `team.roles.lead` (`rules` \| `llm` + model/provider) |
| Auto-fallback if provider missing | Optional config allowlist; default **off** (fail closed) |

Allowlists prevent a lead from spawning arbitrary binaries:

```json
{
  "team": {
    "providerAllowlist": ["claude", "codex", "opencode", "grok"]
  }
}
```

Legacy `coco` / `glm` remain usable when listed in config `agents` and
allowlist.

### Config shape (direction)

Evolve from closed enums toward:

```json
{
  "agents": {
    "claude": { "command": "claude", "args": [], "env": {} },
    "codex": { "command": "codex", "args": [], "env": {} },
    "opencode": { "command": "opencode", "args": [], "env": {} },
    "grok": { "command": "grok", "args": [], "env": {} }
  },
  "team": {
    "policy": "classic-delivery",
    "providerAllowlist": ["claude", "codex", "opencode", "grok"],
    "roles": {
      "lead": { "kind": "in-process", "brain": "rules" },
      "implementer": { "kind": "coding-provider", "provider": "from-task" },
      "reviewer": { "kind": "coding-provider", "provider": "codex" }
    },
    "legacyReviewLoop": true
  }
}
```

Zod: `provider` ids are **string keys present in `agents`** (plus registry
builtins), not a frozen 4-value enum. Migration keeps accepting
`claude|codex|coco|glm` and documents the four product targets.

### What stays provider-agnostic

- Team messages, lead decisions, Task World status commands.
- Publish / delivery check / Feishu-GitHub providers.
- Plugin public DTO redaction.
- Budgets and liveness.

### What stays provider-specific (isolated in adapters)

- argv dialect, stream parsers, session id regex/DB, resume flags,
  structured output extraction, progress text localization.

## Communication model

### Principles

1. **Messages are first-class** for collaboration intent.
2. **Task World is first-class** for durable facts and audit.
3. **Prompt stitching is an adapter detail**, not the collaboration protocol.
4. Agents do not mutate arbitrary backend fields by free text; they use tools
   that go through validated commands.
5. **Provider choice is data**, not a branch inside ReviewLoop.

### Message envelope (minimal)

```ts
type TeamMessage = {
  id: string;
  taskId: string;
  runId: string;
  from: RoleId;          // 'lead' | 'implementer' | 'reviewer' | 'system' | 'human'
  to: RoleId | 'broadcast';
  kind:
    | 'assign'           // lead → implementer
    | 'status'           // member → lead / broadcast
    | 'review_request'   // lead/implementer → reviewer
    | 'review_result'    // reviewer → lead/implementer
    | 'rework_request'   // lead/reviewer → implementer
    | 'escalate'         // any → lead/human
    | 'decision'         // lead → system (structured next action)
    | 'notice';          // system events
  body: string;          // human-readable, length-bounded
  refs?: {
    workspacePathDenied?: true; // never put host paths in body for model-facing exports
    artifactHints?: string[];   // e.g. 'diff', 'pr', 'tests' — not raw secrets
    summaryRef?: 'resultSummary' | 'reviewFindings' | 'progressSummary';
    providerId?: string;        // CodingProviderId for the unit this message concerns
    session?: { providerId: string; sessionId: string; sessionName?: string };
  };
  createdAt: string;
  correlationId?: string; // ties request/response
};
```

### Delivery semantics (v1)

| Choice | v1 decision |
| --- | --- |
| Transport | In-process inbox per role (async queue) |
| Addressing | Role ID within a Task Team Run (not global agent directory yet) |
| Ordering | Per-inbox FIFO; no cross-inbox total order |
| Persistence | Append-only message log stored with run state (local runtime store); **not** required to mirror full bodies into Feishu |
| Visibility | Lead can read all; members default read own inbox + broadcast + messages they sent |
| Triggering | **Messages never trigger unit work.** Only lead assignment with a grant spawns a unit (single-writer invariant) |
| Backpressure | Max inbox depth + max messages/run budget; overflow → system `notice` + lead escalate/fail path |
| Sync RPC | Tool calls remain request/response; messages are not a substitute for tool results |

Out of scope for v1: cross-machine mailboxes, email-style threading UI, Rivus
peer bus as the only transport.

### What is *not* a message

- `resultSummary` / `reviewFindings` / status transitions (Task World writes).
- Coding agent internal tool traces (stay in session transcript).
- Host credentials, absolute workspace paths in public/plugin DTOs.

## Concurrency invariants (the roll-call problem)

Reference failure mode: put several agents in one shared room and ask them to
count off (1, 2, 3, …). Because *observe → decide → act* is not atomic, three
agents post "1" in the same second, two post "2", and by the time "4" is
reached several agents have already said it. This is not a prompt bug; it is
what happens whenever multiple agents watch shared state and self-schedule.
The team runtime is only correct if the following invariants hold as **code
mechanisms**, not documentation:

1. **Single writer per Task Run.** Only `lead` decides which unit acts next;
   units never act because they *observed* the world change. `world.observe`
   is read-only and grants nothing. This is the counting game solved by
   "a teacher calls the name; you speak only when called".
2. **Compare-and-swap on all task state writes.** Every named command carries
   an `expectedStatus` (plus taskId/runId/grant); a mismatch returns a stable
   `task-state-conflict` error instead of silently overwriting. Applies first
   to `TaskProvider.claimTask`, whose current signature
   (`claimTask(task, payload) => void`) has no "someone else claimed it"
   failure semantics — two concurrent runs can both believe they own the task.
3. **Concurrency is unlocked by leases, not by optimism.** A second concurrent
   unit (multi-implementer fan-out, parallel reviewers) is allowed only after
   (a) each actor holds a grant/lease with holder + expiry, (b) leases are
   renewed by the existing liveness heartbeat, and (c) every write goes
   through CAS. Until all three exist, the runtime stays serial per Task Run
   (one lead, one active unit).

Consequence for the communication model: `broadcast` and all-inbox visibility
are **observability** features, never action triggers. Receiving a message
does not license a unit to start work; only a lead assignment (with grant)
does.

## Task World: authority and writers

### Split of authority

| Data | Authority | Who writes | Notes |
| --- | --- | --- | --- |
| Business fields (title, description, project, priority, source ids) | Task Backend | Provider via create/update APIs; agents only through tools | Unchanged |
| Lifecycle `status` / `currentOwner` | Task Backend (+ runtime projection) | **Validated team tools only**, invoked by roles with grant | Not free-form LLM field writes |
| `progressSummary`, `resultSummary`, `reviewFindings`, verdicts | Task Backend / runtime state | Role tools after work units complete | Replaces prompt-only side channel as *the* shared facts |
| `sessionHistory` | Runtime projection (may sync to backend) | Runtime on unit boundaries | Keep as audit timeline; format may gain message ids later |
| Runner liveness (`runnerPid`, heartbeat, …) | Runtime only | Runtime | Never agent-facing in Plugin DTOs |
| Team message log | Runtime only (v1) | Runtime | Optional later export |

### Allowed status transitions (v1)

Keep existing Chinese labels as backend vocabulary. Change **who triggers**
them, not the label set, in the first migration:

| Transition | Today | Agentic v1 |
| --- | --- | --- |
| 待处理 → 执行中/进行中 | claim in execute path | `lead` or `implementer` claim tool |
| → 待复核 | end of execute | `implementer` complete tool **or** `lead` after status message |
| → 修复中 | review reject path | `lead` after `review_result` (or policy auto) |
| → 待发布 / 待验收 | deliverable + publish | `lead` decision tool (+ publisher capability) |
| → 待决策 | escalate | any role `escalate` → lead/human tool |
| → 已失败 / 已完成 | loop/human | `lead` or human CLI |

Invariant: **no role writes status except through a named command** with
preconditions (task id, run id, expected status, grant).

### Field mapping from today

| Existing field | Agentic meaning |
| --- | --- |
| `targetAgent` | **Compat name** for default implementer `CodingProviderId` |
| `runnerAgent` | Active unit’s provider id (any allowlisted provider) |
| `reviewVerdict` / `reviewFindings` | Structured projection of latest `review_result` |
| `resultSummary` | Latest implementer completion summary |
| `sessionHistory` | Timeline of units: role + provider + SessionRef + message anchors |
| `executionSessionId` / `reviewSessionId` | Legacy flat ids; prefer SessionRef in history; keep fields for backend compat |
| `runnerKind` | Active unit kind while a subprocess runs (`implement` \| `review` …) |
| `currentOwner` | May show role label (`lead` / `implementer` / human) — define mapping table in impl RFC |

Backend schema migrations that add free-form provider strings should tolerate
ids beyond the old four; Feishu select fields may need “text or expanded
options” follow-up (implementation detail, track in schema slice).

## Runtime responsibilities (boring on purpose)

Runtime owns:

1. Team Run lifecycle: create, resume, stop, fail-on-budget.
2. Role mailboxes and message log.
3. Spawning External Workers (existing adapters) when a role’s tool says “run coding agent”.
4. Workspaces, liveness, recovery (existing services where possible).
5. Tool grant sets per role.
6. Budgets: max wall time, max agent steps, max review rounds (policy), max messages, max worker spawns.
7. Projection of public Task DTOs (Plugin redaction stays).

Runtime does **not** own:

- Hardcoded “after execute always review” as the only path (policy may do this).
- Free conversation outside a Task Team Run.

## Team policy vs core

### Default policy: “Classic Delivery”

Emulates today’s behavior **using messages + tools**, so UX and backend status
remain familiar:

1. Lead resolves implementer provider (task `targetAgent` / override) and
   reviewer provider (team config); checks allowlist + availability.
2. Lead assigns implementer (`assign`, includes providerId).
3. Implementer runs **unit** on that provider, writes `resultSummary`, sends
   `status` (+ SessionRef).
4. Lead sends `review_request` (or implementer requests review).
5. Reviewer runs **unit** on reviewer provider, sends `review_result`.
6. Lead chooses rework / publish path / escalate / fail.
7. On pass + deliverable, publish-for-acceptance path runs (reuse services).

Implementation note: v1 may literally wrap `ReviewLoopService` behind a
`ClassicDeliveryPolicy` that *emits* messages for observability and routes
units through the provider registry, then v2 removes the while-loop.

### Other policies (later)

- Solo lead (single agent tools only).
- Review-optional fast path.
- Multi-implementer fan-out.

Policies are data/config + code modules, not a second package identity.

## Tools (role action space)

Illustrative v1 tool surface (names can change; grants matter):

| Tool | Roles | Effect |
| --- | --- | --- |
| `world.observe` | all | Read redacted task + recent messages + provider availability; **read-only, grants no action right** |
| `mail.send` | all (to restricted set) | Enqueue `TeamMessage` |
| `provider.list` | lead | Allowlisted providers + caps + availability |
| `unit.run_implement` | lead, implementer | Spawn implement unit via Coding Provider (default from task) |
| `unit.run_review` | lead, reviewer | Spawn review unit via Coding Provider (default from team config) |
| `unit.resume` | lead, owner role | Resume SessionRef if provider cap allows |
| `task.claim` | lead, implementer | Backend claim + status |
| `task.report_progress` | implementer | progressSummary |
| `task.complete_implement` | implementer | resultSummary + toward 待复核 |
| `task.apply_review` | lead, reviewer | verdict/findings projection |
| `task.request_rework` | lead | 修复中 + rework context |
| `task.escalate` | all | 待决策 |
| `task.mark_failed` | lead | 已失败 |
| `task.publish_for_acceptance` | lead | existing publish services |
| `budget.remaining` | lead | observe limits |

External coding CLIs remain **Provider Adapters behind role tools**, not team
inbox peers. Claude does not “mail” Codex; `lead` coordinates, providers only
run units.

## Compatibility

### CLI

| Command | v1 behavior |
| --- | --- |
| `start` / `resume` | Start/resume a Task Team Run with default Classic Delivery policy |
| `watch` / TUI | Show status + (progressively) message timeline / role activity |
| `complete` / `reject` | Human tools into the same world (unchanged UX intent) |

Feature flag or config:

```json
{
  "runtime": {
    "mode": "team",          // future default
    "policy": "classic-delivery",
    "legacyReviewLoop": true // transitional: policy delegates to ReviewLoopService
  }
}
```

First ship can keep `legacyReviewLoop: true` while introducing message log +
role projection so the product spine exists without a big-bang rewrite.

### Rivus Plugin

Keep list/get/create/start as the minimum external surface.

Semantic shift of `task-start`:

- **Before:** start fixed ReviewLoop.
- **After:** start Task Team Run (default policy may still look identical).

Do not expose raw mailboxes or internal paths on Plugin DTOs in v1.
Optional later tools: `task-team-status`, `task-messages` (redacted).

### Package layout (direction, not mandatory split)

Prefer evolving inside `packages/agent-task-loop` first:

- `runtime/` — team run, mailboxes, budgets
- `roles/` — lead/implementer/reviewer agents
- `policies/` — classic-delivery, …
- existing `services/` — adapters, publish, providers (reused as tools)

Avoid a new top-level package until the API stabilizes.

## Keep / change / cut

| Area | Decision |
| --- | --- |
| Task Backend + `TaskProvider` | **Keep** |
| `AgentAdapter` (claude/codex/coco/glm) | **Keep** → evolve into `ProviderAdapter` registry |
| Public Task DTO redaction / Rivus plugin boundary | **Keep** |
| Liveness / workspace / publish services | **Keep**, call from tools |
| `agent-finder` discovery | **Keep**, wire into provider availability |
| `agent-sessions` multi-kind transcripts | **Keep**, extend for provider-scoped SessionRef |
| `TASK_STATUSES` labels | **Keep** initially |
| `sessionHistory` | **Keep**, extend with provider + SessionRef |
| Closed `TARGET_AGENTS` enum as architecture | **Change** → open CodingProvider registry |
| `ReviewLoopService` as core | **Change** → policy shim → optional |
| Hardcoded reviewer = codex | **Change** → role config + allowlist |
| OpenCode / Grok execute path | **Add** adapters + caps (OpenCode spike-aware) |
| Prompt-only collaboration | **Cut** as protocol (may remain inside unit runners) |
| Ambient “workflow engine” product story | **Cut** |
| Assuming all CLIs share UUID jsonl sessions | **Cut** |

## Success criteria

Direction is real when all of the following hold:

1. A Task Team Run can be explained without referring to `ReviewLoopService`.
2. At least three roles exchange `TeamMessage`s that are persisted and visible in TUI/debug.
3. Next-step choice for rework/publish/escalate is a **lead decision** (tool or structured decision message), not only a `while` branch — even if classic policy auto-decides.
4. Plugin `task-start` still produces a backend-visible lifecycle compatible with current statuses.
5. No expansion of secret/path leakage through messages or Plugin DTOs.
6. **Implementer** can be any of `claude` \| `codex` \| `opencode` \| `grok` when that provider is configured, allowlisted, and `unit.execute`-capable (missing provider → stable error, not silent codex).
7. **Reviewer** provider is config-selected (not a hardcoded `pickReviewerAgent → codex` only path).
8. SessionRef round-trips for at least Claude and Codex; OpenCode uses non-UUID ids without breaking history parse; Grok uses opaque refs until proven otherwise.
9. `provider.list` / doctor answers capability + availability for the four product providers.
10. Two concurrent claimers on one task: exactly one wins, the other gets a
    stable `task-state-conflict` error (the roll-call problem cannot be
    reproduced against task state writes).

## Open questions

1. Is `lead` always an LLM, or is rule-based lead + LLM only for hard cases acceptable for v1 reliability?
2. Should message log ever sync to Feishu/GitHub, or stay local runtime only?
3. Single-process multi-task concurrency model (one runtime many runs vs process-per-run as today)?
4. When do we flip default `legacyReviewLoop` to false?
5. Relationship to `@rivus/agent` Peer Delegation: reuse later for cross-host teams, or keep task-loop team runtime independent forever?
6. **Grok headless contract**: which binary/API is authoritative for coding units (CLI name, auth, resume)?
7. **OpenCode invoke dialect**: confirm non-interactive “run this prompt in cwd” flags and resume-by-`ses_…` before promising `unit.resume`.
8. Feishu/GitHub `targetAgent` fields: free text vs expanded select options for `opencode` / `grok`.
9. Should auto-fallback across providers ever be on by default, or always explicit allowlist?

## Implementation slices (suggested)

1. **Claim CAS (first, smallest, standalone)**: give `TaskProvider.claimTask`
   conflict semantics — `expectedStatus` + `claimedBy` precondition, stable
   `task-state-conflict` error; wire the same guard into all runtime state
   writes. Ships before anything team-related; it hardens today's loop against
   concurrent runs.
2. **Provider registry + types**: `CodingProviderId`, capabilities, SessionRef; open config keys; map finder ids.
3. **Adapters**: keep claude/codex; add `opencode` + `grok` behind the same interface; remove hardcoded reviewer pick.
4. **Contract + team types**: `TeamMessage`, role ids, run state, config flag `team.*`.
5. **Mailbox + log** in local runtime store; history lines include provider. (Observability first; messages never trigger work.)
6. **ClassicDeliveryPolicy** wrapping existing ReviewLoop, emitting messages at unit boundaries; provider chosen from registry.
7. **Lead decision port**: extract next-step enum from while-loop into a replaceable function (rules first).
8. **OpenCode session provider** (agent-sessions) once execute path is green.
9. **Replace rules lead with LLM lead** under the same tool grants (requires named commands + CAS everywhere).
10. **Remove while-loop** once policy+tools cover recovery paths.
11. **Docs**: README/CONTEXT/workflow → team runtime + multi-provider narrative.

## Alternatives considered

- **A: Single lead agent only** — more agentic than today, weaker “team” product; can be a policy later, not the north star.
- **Keep workflow core + external harness** — rejects product identity goal.
- **Full Rivus-native multi-agent only** — couples delivery domain to Host; External Workers and Task Backend fit better inside this package’s runtime.
- **Inbox-only with no Task World** — loses audit and backend integration; rejected.
- **One mega-adapter with if/else per CLI inside ReviewLoop** — rejected; freezes team design into provider branches.
- **Require full parity before enabling a provider** — rejected; capability matrix + fail-closed is enough.
- **Use only agent-finder ids as task field values** (`claude-code` vs `claude`) — rejected for task UX churn; keep short CodingProviderId + explicit finder map.

## References

- Current lifecycle: `docs/workflow.md`
- Domain language: `CONTEXT.md`
- Plugin boundary: `rfcs/0009-rivus-task-manager-plugin.md`
- Discovery: `rfcs/0002-code-agent-discovery.md`
- Sessions / OpenCode notes: `docs/plans/issue-25-shared-sessions.md`
- Loop core: `packages/agent-task-loop/src/services/review-loop-service.ts`
- Adapters: `packages/agent-task-loop/src/adapters/*`
- Config enums today: `packages/agent-task-loop/src/config/schema.ts`
