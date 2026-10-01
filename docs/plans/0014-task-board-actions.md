# Task Board Actions and Room-to-Task Link

- Status: blocked
- Owner: unconfirmed
- Reviewer: unconfirmed
- Last updated: 2026-10-01
- Paired Spec: [`docs/specs/0014-task-board-actions.md`](../specs/0014-task-board-actions.md)

## Contents

1. Background and goals
2. Outline
3. Execution plan
4. Risks, open questions, and follow-up

## 1. Background and goals

### 1.1 Current behavior and constraints

- Delivered: the `./task-management` export, lane grouping
  (`apps/room-web/app/board/domain/lanes.ts`), the read-only `/board` and
  `/task/:id`, and a palette that clears the 4.5:1 contrast floor.
- The Room's fake task loop (`MemoryTaskDeliveryRepository` in room-web) is
  gone; room-web has no task action.
- `TARGET_AGENTS` (`packages/agent-task-loop/src/types/task.ts`) and
  `AGENT_LABEL` (`task-management/github-issues-task-provider.ts`) hardcode
  `claude|codex|coco|glm`. room-web's `agents` table implements
  `AgentRegistry` from `@rivus/agent-orchestration`.
- The shared draft (工作稿) that RFC 0013 wanted to promote into a Task was
  rejected by the collaboration design: rooms are the only shared context and
  there is no shared draft. What a Room promotes is therefore undecided.
- `room-lab.tsx` polls with `useRevalidator` while members run.
- `StatefulTaskProvider` writes run-time state without a cross-process lock;
  the `task:<taskId>` lease serializes runs on one machine only.

### 1.2 Problem

See the paired Spec.

### 1.3 Goals and success criteria

Spec 0014 scenarios S1–S6 have automated tests, and a detector pass
(`npx impeccable detect <url> --viewport 1280x800` and `--viewport 390x844`)
over the shared shell reports no new findings.

### 1.4 Non-goals

As in the Spec.

## 2. Outline

### 2.1 Boundaries and responsibilities

- Board actions call agent-task-loop application services through a public
  export; room-web does not reimplement status transitions.
- The roster is the control plane's `AgentRegistry` port. agent-task-loop reads
  it through its own adapter; where the CLI runs without room-web, the adapter
  source is unconfirmed.

### 2.2 Design decisions

| Decision                                                                                                   | Status                            |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------- |
| What a Room promotes into a Task (a selected message, the room title and goal, or a person-written intake) | unresolved                        |
| Where the CLI reads the roster when room-web's sqlite library is absent                                    | unresolved                        |
| How `TargetAgent` stays compatible for published consumers                                                 | unresolved                        |
| Claim compare-and-set per backend (Feishu record version, GitHub label or assignee)                        | unresolved                        |
| SSE endpoint per room and per task run                                                                     | chosen by RFC 0014, not yet built |

## 6. Execution plan

Blocked on the unresolved decisions above. Batches once unblocked, each one
PR, in this order (from RFC 0014's slice table):

#### Task 1: Operate-register shell

- Files: `apps/room-web/app/root.tsx`, route layouts, `app/styles/global.css`.
- Change: one navigation shell (看板, 房间, Agents) and a context column
  replacing modals; one state token vocabulary (`idle`, `running`, `held`,
  `blocked`, `error`, `done`).
- Tests: component tests; detector at both viewports.
- Exit condition: board and rooms render inside the same shell.

#### Task 2: One agent registry

- Files: `packages/agent-task-loop/src/types/task.ts`,
  `task-management/github-issues-task-provider.ts`, a registry adapter.
- Tests: S3.
- Exit condition: `agent:grok` issue listed by CLI and board.

#### Task 3: Task from a Room

- Files: room-web room service and routes; `TaskRecord` room reference.
- Tests: S4.
- Exit condition: a Task created from a Room is visible in the TUI.

#### Task 4: Accept and rework from the board

- Files: `/task/:id` action; a public agent-task-loop export for the complete
  and reject services.
- Tests: S1, S2.
- Exit condition: the Task leaves 待你决定.

#### Task 5: SSE instead of loader revalidation

- Files: new resource routes; `room-lab.tsx`.
- Tests: S5.
- Exit condition: no polling interval while a turn runs.

#### Task 6: Claim compare-and-set

- Files: providers' `claimTask`.
- Tests: S6.
- Exit condition: concurrent claim test yields one success.

### 6.4 Validation ledger

| Batch | Command or evidence                         | Expected result |
| ----- | ------------------------------------------- | --------------- |
| each  | `pnpm test`, `pnpm build`, `pnpm typecheck` | pass            |
| 1     | detector at 1280x800 and 390x844            | no new findings |

### 6.5 Rollback per batch

Each task is one PR and reverts alone. Task 3 adds an optional field; reverting
it leaves existing records valid.

## 7. Risks, open questions, and follow-up

| Item                                            | Type      | Impact                                   | Owner       | Next step or deadline                                         |
| ----------------------------------------------- | --------- | ---------------------------------------- | ----------- | ------------------------------------------------------------- |
| The Feishu Base is live user data               | risk      | A wrong unattended write                 | unconfirmed | Writes only from a person's action; tests use fakes or GitHub |
| Five lanes hide exact statuses                  | risk      | Confusion between 待决策, 待发布, 待验收 | unconfirmed | Cards keep the exact status                                   |
| Replacing the visual world discards design work | risk      | Rework                                   | unconfirmed | Decide with Task 1 review                                     |
| A task run that opens its own Room              | follow-up | New collaboration mode                   | unconfirmed | Separate Spec when wanted                                     |
