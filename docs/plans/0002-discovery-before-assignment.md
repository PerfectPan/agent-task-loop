# Discovery Before Assignment

- Status: blocked
- Owner: unconfirmed
- Reviewer: unconfirmed
- Last updated: 2026-10-01
- Paired Spec: [`specs/0002-discovery-before-assignment.md`](../../specs/0002-discovery-before-assignment.md)

## Contents

1. Background and goals
2. Outline
6. Execution plan
7. Risks, open questions, and follow-up

## 1. Background and goals

### 1.1 Current behavior and constraints

- `discoverRunnableAgents` in `packages/agent-task-loop/src/commands/init.ts`
  is the only caller of `collectHostProbe()` and `discover()`.
- Task start goes through `TaskStartService`
  (`packages/agent-task-loop/src/task-manager/task-start-service.ts`), shared
  by the CLI and the Rivus `task-start` tool, after the `task:<taskId>` lease
  is acquired.
- `init` maps discovery ids to loop agent names: `claude-code` → `claude`,
  `codex` → `codex`. `coco` and `glm` have no mapping.

### 1.2 Problem

A non-runnable target agent is detected only when its process fails, after the
Task was claimed and moved to 执行中.

### 1.3 Goals and success criteria

- Spec 0002 scenarios S1–S3 pass as automated tests with a fake probe.
- No Task Backend write happens when the check refuses.

### 1.4 Non-goals

- Automatic agent substitution.
- Changes to the MoonBit catalog.

## 2. Outline

### 2.1 Boundaries and responsibilities

The check belongs to the task-manager application layer, before the claim, as
a port (`AgentAvailability`) with a discovery-backed adapter in
infrastructure. The agent-finder package is unchanged.

### 2.2 Design decisions

| Decision | Options | Choice |
| --- | --- | --- |
| Where to check | CLI command vs `TaskStartService` | `TaskStartService`, so CLI and Rivus behave the same |
| Id mapping | Duplicate `init`'s map vs one shared map | One shared map used by `init` and the check |
| Probe freshness | Every start / per process / TTL cache | **Unresolved**, see section 7 |

## 6. Execution plan

Blocked until the freshness decision in section 7 is made.

### 6.1 Preconditions

- Spec 0002 reviewed.
- Freshness decision recorded here.

### 6.2 Completion contract

- S1, S2, S3 each have a test in `packages/agent-task-loop/tests/`.
- `pnpm test`, `pnpm build`, `pnpm typecheck` pass.
- A changeset for `@rivus/agent-task-loop` describes the new refusal.

### 6.3 Execution order

#### Task 1: Shared id map and availability port

- Files: `packages/agent-task-loop/src/commands/init.ts`, a new module under
  `src/task-manager/` for the port, a discovery adapter under
  `src/task-management/` or `src/services/` (unconfirmed placement).
- Change: move the discovery-id map out of `init.ts`; add the port and the
  adapter.
- Tests: adapter unit test with a fake `discover` result.
- Exit condition: `init` tests unchanged and passing.

#### Task 2: Check in `TaskStartService`

- Files: `src/task-manager/task-start-service.ts`, `task-manager-error.ts`,
  the Rivus tool error mapping.
- Change: refuse before claim when the mapped agent is not `runnable`; skip
  agents with no mapping.
- Tests: S1, S2, S3.
- Exit condition: the three scenario tests pass.

### 6.4 Validation ledger

| Batch | Command or evidence | Expected result |
| --- | --- | --- |
| 1 | `pnpm test` | pass |
| 1 | `pnpm typecheck` | pass |

### 6.5 Rollback per batch

One PR; revert it. No persisted data changes.

## 7. Risks, open questions, and follow-up

| Item | Type | Impact | Owner | Next step or deadline |
| --- | --- | --- | --- | --- |
| How fresh discovery must be before assignment: every start, once per process, or a TTL cache with manual refresh | open question | Blocks the plan; version probes add start latency | unconfirmed | Decide before implementation |
| Should path evidence stay only in `evidence`, or should `config_paths` / `mcp_config_paths` become objects with `path` and `exists` | open question | Changes the discovery JSON contract (`schema_version`) | unconfirmed | Decide independently of this plan |
| Which providers need platform-specific command names or install paths beyond the shared matrix | open question | Detection accuracy on Windows and Linux | unconfirmed | Collect reports |
| Agent command names and config paths drift over time | risk | False `missing` refusals | unconfirmed | S3 skip rule limits the blast radius |
