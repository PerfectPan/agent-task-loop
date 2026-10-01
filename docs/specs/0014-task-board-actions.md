# Spec 0014: Task Board Actions and Room-to-Task Link

Carries the open scope of the retired RFC 0014 (Task Board and the Operate
Surface, slices 6–10) and the unimplemented parts of RFC 0013 (Local Room
Workspace: promotion into a Task and human accept or rework). The delivered
read-only board, task detail page, and lane grouping are documented in
[`docs/architecture/agent-collaboration.md`](../architecture/agent-collaboration.md#task-board).

## Status

Draft

Paired Plan: [`docs/plans/0014-task-board-actions.md`](../plans/0014-task-board-actions.md)

## Problem And Scope

The board at `/board` shows real Tasks but cannot act on them, so the 待你决定
lane has no action. Rooms and Tasks do not link to each other. Agents are
listed in three places that disagree: `TARGET_AGENTS` and the GitHub
`agent:<name>` label pattern (`claude`, `codex`, `coco`, `glm`) in
agent-task-loop, and the room-web `agents` table. An issue labelled for an
agent outside the hardcoded four (for example `agent:grok`) is invisible to the
CLI, the TUI, and the board.

In scope:

- Human accept and rework from the board.
- One agent roster for Room seats, Task `targetAgent`, and issue labels.
- Creating a Task from a Room, with a link in both directions.
- Live updates instead of whole-loader polling during agent turns.
- One Operate-register shell shared by the board and rooms.
- Safe concurrent claims across the CLI, TUI, and web.

Out of scope: replacing Feishu Base as the system of record, unattended writes
to a live Base, hosting on a public URL, merging `apps/web` and
`apps/room-web`, and changes to HELD, the wake rule, or lease rules.

## Behavioral Requirements

- A person must be able to accept or request rework for a Task in 待你决定
  from the board; the Task leaves that lane and the write goes to the Task's
  owning backend through the same application service the CLI uses.
- A model review PASS must never be shown or recorded as human acceptance.
- An agent registered once must be usable as a Room member, as a Task
  `targetAgent`, and as a GitHub `agent:<id>` label.
- A Task created from a Room must record that Room, the board card and task
  page must link to the Room, and the Room must link to the Task.
- While an agent turn runs, the composer and the board must stay usable and
  receive updates without reloading the whole page.
- Two surfaces claiming the same Task at the same time must result in exactly
  one claim.
- Board, rooms, and agents must share one navigation shell; secondary detail
  opens in a context column rather than a modal unless focus must be
  protected.

## Domain Invariants

- The Task Backend stays authoritative for Task fields; the web keeps no Task
  copy.
- Only a person's action moves a Task out of 待验收 or 待决策.
- One roster: no second hardcoded agent list.

## Acceptance Examples

### S1: Accept from the board

- Given a Task in 待验收 on a GitHub source
- When the person accepts it on `/task/:id`
- Then the Task moves to 已完成 through the same path as `agent-task-loop complete`
- And it appears in 已结束 on the next board read

### S2: Rework from the board

- Given a Task in 待验收
- When the person requests rework with feedback
- Then the Task moves to 修复中 with the feedback recorded, as `agent-task-loop reject` does

### S3: A new agent is assignable everywhere

- Given an agent `grok` registered once
- When an issue carries the label `agent:grok`
- Then the CLI, the TUI, and the board list it as a Task targeting `grok`
- And `grok` can be seated in a Room

### S4: Task from a Room

- Given a Room with a finished discussion
- When the person creates a Task from it
- Then the Task exists in the chosen backend with the Room recorded
- And the board card links to the Room and the Room links to the Task

### S5: Live turn

- Given a Room with a member turn running
- When a post lands
- Then the person sees it without a full-page revalidation, and the composer keeps its draft

### S6: Concurrent claim

- Given the same pending Task started from the CLI and from the web at the same moment
- When both claims reach the backend
- Then exactly one claim succeeds and the other reports a conflict

## Compatibility And Constraints

- Public API: `@rivus/agent-task-loop` gains a registry-backed agent roster;
  `TARGET_AGENTS` and `TargetAgent` are published today, so a change needs a
  changeset and a compatibility decision.
- Persisted data: `TaskRecord` gains an optional room reference (Feishu field
  and GitHub representation unconfirmed).
- Configuration: unconfirmed.
- Operational bounds: no unattended write to a live Feishu Base; automated
  tests use fake providers or GitHub test repositories only.

## Acceptance Evidence

- Scenario IDs and corresponding tests: not written yet.
- Runtime or package evidence: not available yet.
