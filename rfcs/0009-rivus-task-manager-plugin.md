# RFC 0009: Rivus Task Manager Plugin

## Status

Proposed

## Summary

`@rivus/agent-task-loop` will export a side-effect-free
`@rivus/agent-task-loop/rivus-plugin` entry point. The Plugin registers one Task
Manager Agent Profile and four namespaced Tools: list, get, create, and start.

The Plugin is an adapter over agent-task-loop application services. It does not
move Task records, backend credentials, execution/review state, workspaces, or
external workers into Rivus. Rivus remains the Host that resolves the Profile,
intersects it with a Deployment's exact Tool allowlist, invokes Tool executors,
and owns Endpoint delivery.

## Motivation

Agent Task Loop already owns a complete task domain and execution/review state
machine, but it is currently reachable only through its CLI and TUI. Shelling
out to that CLI from a Rivus Tool would duplicate parsing, make errors unstable,
and risk leaking command arguments or local paths. A small application boundary
lets the existing CLI and a Rivus Plugin share the same Task Provider and Task
Run orchestration directly.

The public slice must be smaller than the full CLI. List, get, create, and start
form the minimum coherent loop: discover work, inspect it, request new work, and
start the existing execution/review workflow. Update, transition, watch,
reporting, cleanup, approval, and publication remain outside this first Plugin
surface because they either expose internal workflow transitions or need a
separate user-interaction contract.

## Domain and Trust Boundaries

| Boundary | Owns | Must not own or expose |
| --- | --- | --- |
| Task Backend adapter | Backend credential, API calls, backend authorization, authoritative Task fields | Endpoint credential, model prompt, public DTO mapping |
| agent-task-loop application layer | Task Provider routing, Task Run start/recovery/review orchestration, domain errors | Rivus Deployment, Endpoint delivery, Tool grants |
| Task Manager Plugin | Strict Tool input validation, application calls, bounded public DTOs, neutral error mapping | Raw config, credentials, paths, process/session state, a second task state machine |
| Rivus Host | Plugin loading, Profile resolution, exact Deployment allowlist, invocation authority, audit, Endpoint and model credentials | TaskRecord semantics, backend configuration, task lifecycle rules |
| External Worker | Coding execution selected by agent-task-loop | Rivus Endpoint identity, implicit Subagent status |

Task Backend state remains authoritative and is refreshed through the Task
Provider. It is not copied into Rivus Memory. A Task Manager Profile does not
receive ambient Shell, filesystem, network, Endpoint, or Memory capabilities.

## Public Plugin Contract

### Registration

The Plugin manifest id is `agent-task-loop`. It registers the `task-manager`
Profile with no Skills and no Memory scopes. The Profile declares exactly these
Tools:

| Tool ID | Purpose | Risk | Idempotency contract |
| --- | --- | --- | --- |
| `agent-task-loop/task-list` | List a bounded, optionally filtered Task summary set | `observe` | `supported` |
| `agent-task-loop/task-get` | Read one Task by id | `observe` | `supported` |
| `agent-task-loop/task-create` | Create a Task in the selected/default backend | `mutate` | `none`; the Host must not replay an indeterminate call |
| `agent-task-loop/task-start` | Start or recover the existing execution/review loop | `mutate` | `none`; liveness prevents a known concurrent duplicate, but crash recovery is not replay-safe |

Tool versions start at `1.0.0`. Each descriptor has a stable digest tied to its
input and output contract. Changing a Schema, risk floor, idempotency promise,
or DTO meaning requires a version/digest change.

Deployment remains a second, mandatory restriction. A Deployment that allows
only list/get resolves only those two Tools even though the Profile declares all
four. Skill text, model output, and inbound payloads cannot add a Tool.

### Inputs

All Tool Schemas are JSON objects with `additionalProperties: false`, explicit
required fields, enum bounds, string length bounds, and numeric bounds.

- list: optional `status`, `targetAgent`, and `limit` (`1..100`, default `50`)
- get: required `taskId`
- create: required `taskId`, `title`, `project`, `targetAgent`, and `priority`
  (`0..9`); optional bounded `description` and `source`
- start: required `taskId`; optional `targetAgent` override and `maxRounds`
  (`1..20`, default `5`)

The executor validates again at runtime because direct calls must not rely on a
model or Host having applied the JSON Schema first.

### Outputs and Redaction

Tools return explicit public DTOs, never raw `TaskRecord` or provider responses.
The readable Task DTO allowlist is:

- `taskId`, `title`, `description`, `project`, `repository`, `source`
- `targetAgent`, `priority`, `status`, `currentOwner`
- bounded `progressSummary`, `resultSummary`, and `prLink`
- review/acceptance round and verdict values
- `createdAt` and `updatedAt`

List is capped at 100 Tasks and reports whether more records existed. Text
fields are length-bounded by the DTO mapper. Mutation results contain only the
Task id, action, and the final public Task when one is safely available.

The following fields are denied even when present on `TaskRecord`:
`workspacePath`, all log paths, all session ids/names/history, `runId`,
`runnerPid`, runner/heartbeat details, claim identity, publish branch/commit,
raw provider data, raw config, tokens, and `lastError`. Backend exceptions are
translated to stable operation-specific errors and their messages are not
forwarded to the model, events, or logs.

Invalid input and a missing Task produce stable readable business errors.
Unknown provider/config/runtime failures produce a neutral
`task-backend-failed` or `task-run-failed` error without the original exception.

## Application Structure and Data Flow

The shared application service depends on the existing `TaskProvider` port for
list/get/create and on a `TaskStarter` port for start. The default TaskStarter is
the existing CLI start orchestration extracted into a service; it still uses
`TaskRunnerLivenessService`, `ReviewLoopRunner`, and the current recovery/rework
rules. The CLI calls that same service, preserving its behavior and state
machine.

```text
CLI start ───────────────┐
                        ├─> Task start application service ─> ReviewLoopRunner
Rivus task-start Tool ───┘                     │
                                              └─> TaskProvider ─> backend adapter

Rivus list/get/create Tool ─> Task Manager application ─> TaskProvider
                                      │
                                      └─> bounded public DTO / neutral error
```

The exported Plugin factory accepts an async Task Manager capability factory so
deployments and tests can inject a provider-backed Composition Root. The default
factory dynamically loads the existing JSON configuration and constructs the
services only when a Tool executor is called. Import and registration do not
read config, inspect the home directory, create a provider, start a process,
open a network connection, or create a timer. Each invocation gets a fresh
application composition; the Plugin owns no resource that requires disposal.

## Package and Version Contract

`package.json` adds an explicit `./rivus-plugin` export with ESM and TypeScript
declarations, and the build has a separate entry for it. The CLI export and bin
remain unchanged.

The Plugin uses `RIVUS_PLUGIN_API_VERSION`, `RivusPlugin`,
`RivusToolInputRejected`, and `@rivus/agent/testing`'s
`assertRivusPluginConforms`. These APIs are present in the published
`@rivus/agent@0.1.1` package and remain present in the 0.3.0 source. Therefore
the peer range is `>=0.1.1 <0.4.0`; tests exercise the published lower bound and
the current local 0.3.0 package without committing a local path or tarball.

## Testing

Implementation proceeds as vertical red-green slices through public seams:

1. DTO projection and bounded list behavior, including an adversarial
   `TaskRecord` containing every denied field.
2. list/get/create routing through an in-memory Task Provider; missing Task and
   provider-error mapping.
3. start routing and exactly-once application invocation per Tool execution;
   the extracted CLI start service keeps liveness/recovery behavior.
4. strict runtime input validation matching each JSON Schema.
5. Plugin Conformance registration, Profile/Tool references, an observe-only
   Deployment that cannot gain mutate Tools, and disposal with zero resources.
6. package smoke after `npm pack`: a clean temporary consumer imports both the
   CLI and `@rivus/agent-task-loop/rivus-plugin`, resolves declarations, and
   runs against the peer lower bound.
7. a local Rivus terminal composition invokes `task-get` against a fake provider
   and returns the redacted DTO without Feishu or GitHub credentials.

Tests use fake/in-memory providers only. They do not load a personal config or
contact a real backend.

## Alternatives Considered

- **Expose every CLI command as a Tool.** Rejected because CLI commands include
  workflow-internal transitions and machine-local observability not suitable for
  a model-facing public API.
- **Shell out to the package CLI.** Rejected because it duplicates validation,
  weakens typed boundaries, exposes process arguments, and makes error redaction
  unreliable.
- **Move TaskRecord or the state machine into Rivus.** Rejected because it
  couples Core to one business domain and makes Memory or Host state compete
  with the Task Backend.
- **Make start replay-idempotent in the descriptor.** Rejected because current
  crash recovery can identify active/stale workers but cannot prove an
  indeterminate external execution has not already produced effects.

## Compatibility and Release

Existing CLI behavior and configuration stay compatible. The new peer is
required only by consumers that install this package; package validation proves
the CLI and Plugin coexist. The feature receives a Changeset and durable Plugin
documentation. It does not publish `@rivus/agent`, this package, an npm tag, or a
GitHub Release as part of implementation.
