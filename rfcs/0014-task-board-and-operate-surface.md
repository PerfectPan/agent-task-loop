# RFC 0014: Task Board and the Operate Surface

| Field | Value |
| --- | --- |
| Status | Draft |
| Date | 2026-09-15 |
| Related | RFC 0005 (GitHub task source), RFC 0006 (run-time state), RFC 0009 (task manager plugin), RFC 0010 (room kernels), RFC 0013 (local room workspace) |

## Summary

`apps/room-web` today is a chat room with a toy task loop bolted on. The real
task pipeline — ten statuses, two backends, worktree execution, review rounds,
human acceptance, publication — lives in `@rivus/agent-task-loop` and is
reachable only from a terminal UI. The web surface cannot see a single real
task.

This RFC does three things:

1. Connects the web surface to the real Task Backend.
2. Adds a board over the pipeline that already exists in `TASK_STATUSES`.
3. Rebuilds the interface in the Operate register instead of the Experience one.

## Diagnosis

### Three things are called Task and none of them is the same thing

| Name | Where | Lifetime | Backend |
| --- | --- | --- | --- |
| `TaskRecord` | `agent-task-loop/types/task.ts` | durable | Feishu bitable, GitHub Issues |
| `TaskDelivery` | `agent-task-loop/task-delivery` | one run | in-memory kernel |
| `state.task` | `room-web` read-model | until restart | `MemoryTaskDeliveryRepository` |

`apps/room-web/app/room-lab/infrastructure/local-task-delivery.server.ts` builds
a `MemoryTaskDeliveryRepository` and a two-seat `impl`/`review` runtime. Nothing
it produces reaches a backend, survives a restart, or appears in the TUI. The
web surface therefore shows a task that no other part of the system agrees
exists.

The web also cannot reach the real one: `@rivus/agent-task-loop` exports only
`./task-delivery` and `./rivus-plugin`. `buildTaskProvider`, `TaskProvider`, and
`TaskRecord` are unreachable across the package boundary.

### The board already exists as data

`TASK_STATUSES` is a pipeline, not a set of flags:

```
待处理 → 进行中 → 执行中 → 待复核 → 修复中 → 待决策 → 待发布 → 待验收 → 已完成 / 已失败
```

`TaskRecord` already carries everything a card needs: `title`, `project`,
`targetAgent`, `priority`, `status`, `progressSummary`, `prLink`,
`reviewVerdict`, `reviewFindings`, `acceptanceVerdict`, `lastHeartbeatAt`,
`logPath`. Nothing new has to be modeled. The board is a view that does not
exist yet, not a schema that is missing.

`CompositeTaskProvider` already aggregates several backends and routes each
write back to the `source` that owns the record. The 多维表格 is already the
system of record. This RFC does not move it.

### The agent roster is hardcoded three times, differently

| Place | List |
| --- | --- |
| `types/task.ts` `TARGET_AGENTS` | `claude`, `codex`, `coco`, `glm` |
| `room-web` `agentSeatBinding` | `claude-relay`, `claude`, `codex`, `opencode`, `dsh` |
| `github-issues-task-provider` `AGENT_LABEL` | `claude`, `codex`, `coco`, `glm` |

The intersection is two agents. Issues #93 and #94 in
`PerfectPan/agent-task-loop` carry `agent:grok`, which no list contains, so they
silently fall back to `defaultAgent`. An agent that can be seated in a Room
cannot be assigned a Task, and vice versa. One registry has to own this.

### The interface is in the wrong register

Impeccable's mode taxonomy names four registers by what success looks like for
the person on the surface. This is **Operate**: the user is completing a task,
so "scanability, consistency, native expectations, and the real usage scene
outrank expression" and "the tool should disappear into the task."

`RoomWorkspace.tsx` is built in the Experience register. Concrete findings,
against the rules they violate:

| Finding | Rule |
| --- | --- |
| All three secondary surfaces (成员, 运行详情, 新建房间) are modals | `product-ban-modal-first-thought`, `skill-reflex-modal-by-reflex` |
| `bg-washi/85 backdrop-blur-[10px]` over a photographic background | `skill-ban-glassmorphism-default` |
| Bricolage Grotesque, a display face, across UI labels and data | `product-ban-display-fonts-ui` |
| Four stacked `bg-gold/70` strips carry four unrelated meanings | `product-color-state-vocab` |
| No skeleton, no empty state, no per-control loading state | `product-components-skeleton-loading`, `product-components-empty-states` |
| Focus ring, selection, caret, scrollbar all browser default | `skill-craft-browser-surfaces` |
| Inline `#f6e4de` and `#ffe17a` | project style rules, `product-color-second-neutral` |

The illustrated crew is not itself the problem — a fixed identity per agent is
useful. Sizing it at 70px, on a garden photograph, behind glass, as the primary
visual event of a work surface is.

## Goals

- One reachable Task Backend boundary, consumed identically by CLI, TUI and web.
- A board whose loudest element is the lane that needs a human decision.
- A Room that can promote its draft into a real Task, and a Task that links back
  to the Room where it was discussed.
- An Operate-register interface with a real state vocabulary.
- One agent registry.

## Non-goals

- Replacing the 多维表格 as system of record.
- Writing to the user's live bitable from an unattended run.
- Hosting any of this on a public URL.
- Changing HELD, `shouldWake`, or occupancy kernel rules.
- Merging the two web apps (`apps/web`, `apps/room-web`) in this RFC.

## Part 1: Capability

### 1.1 Export the task-management boundary

Add `src/task-management.ts` as an rslib entry and `"./task-management"` to
`exports`. It re-exports `TaskRecord`, `TaskStatus`, `TaskProvider`,
`buildTaskProvider`, `loadConfig`, and the source-id helpers. Nothing new is
written; an existing internal boundary becomes a package boundary.

This is the load-bearing change. Everything below depends on it.

### 1.2 Delete the fake task loop from the web

`LocalTaskDelivery` and its `MemoryTaskDeliveryRepository` go. The web reads and
writes `TaskRecord` through the provider. Running a task from the web calls the
same start service the CLI calls; it does not re-implement a seat runtime.

### 1.3 One agent registry

A single `AGENTS` table owns: id, display name, portrait, CLI binding, whether
it can hold a Room seat, whether it can be a `targetAgent`, and its issue label.
`TARGET_AGENTS`, `agentSeatBinding`, and `AGENT_LABEL` all derive from it.
Adding grok or gemini becomes one row.

### 1.4 Run observability

`logPath`, `sessionHistory`, `lastHeartbeatAt` and `runnerPid` are already
written by the loop and already read by the TUI. The web shows none of them. A
task detail view tails the log the same way `tui/logic/session-tail.ts` does.

### 1.5 Streaming

Agent turns run 30–120s. The web currently revalidates the whole loader. An SSE
endpoint per room and per task run replaces the poll.

### 1.6 Concurrency

The TUI, the CLI and the web can all write the same backend. `StatefulTaskProvider`
persists run-time state to a file store with no cross-process lock. Claiming a
task must be a compare-and-set against the backend, not a local write.

## Part 2: Board

### Lanes

Ten statuses are too many columns. Five lanes, grouped by who is waiting:

| Lane | Statuses | Waiting on |
| --- | --- | --- |
| 待办 | 待处理 | nobody — ready to start |
| 进行中 | 进行中, 执行中, 修复中 | an agent |
| 审核中 | 待复核 | the review seat |
| **待你决定** | 待决策, 待验收, 待发布 | **the human** |
| 已结束 | 已完成, 已失败 | nobody |

The board's job is to make 待你决定 impossible to miss. Everything else runs
itself; that lane is the only place the pipeline stops for a person. It gets the
accent color, the count, and the top of the reading order. Model PASS is not
acceptance — a `reviewVerdict: 通过` sits in 待你决定 until a human acts, which
is the distinction RFC 0013 asked for and never got a surface.

### Card

Title, project, target agent portrait, priority, and one line of
`progressSummary`. Failure shows `lastError`; a published task shows its PR.
Cards are not the page structure — the lane is. No nested cards.

### Source

The board reads `provider.listTasks()`. Records keep their `source`, so a
Feishu-owned task and a GitHub-owned task sit in the same lane and each write
routes home. A source filter mirrors `tui/components/SourceFilter.tsx`.

### The join with Room

`TaskRecord` gains one optional field: `roomId`. A task promoted from a Room
carries it; a task created in the bitable does not. The card links to the Room
when it has one, and the Room header links to the Task. This is the
"跳到这里看工作内容" path: the bitable row is the record, the board is the view,
the Room is where the work was argued out.

Promotion writes the Room's 工作稿 into `description` and opens intake with
goal, constraints, deliverable and acceptance criteria prefilled.

## Part 3: Interface

Register: Operate. The visual world is replaced, not polished — refinement on a
discarded look is the failure mode the impeccable skill names explicitly.

### Structure

Three columns. Left: navigation (看板, 房间, Agents). Center: the surface. Right:
context — run detail, members, task detail. The right column replaces all three
current modals. A dialog survives only where focus must be protected.

### Type

One family. Fixed rem scale, ratio 1.125–1.2. No fluid clamp headings. The
display face leaves UI labels, buttons and data.

### Color

Restrained neutral, plus a second neutral layer for the nav and the context
column, plus one accent reserved for primary action and current selection.

A real state vocabulary replaces the four identical yellow strips:

| State | Meaning |
| --- | --- |
| `idle` | seated, nothing running |
| `running` | a turn is in flight |
| `held` | a draft is held, waiting on a wake |
| `blocked` | needs a human decision |
| `error` | the run failed |
| `done` | finished |

Each is a token, used identically on a board card, a room member, and a task
row. Today the same yellow means "you are missing a seat", "an agent needs
attention", and "a task exists".

### Motion

150–250ms, state only. No page-load choreography.

### Floor

Every interactive control ships default, hover, focus, active, disabled,
loading, error. Skeletons, not centered spinners. Empty states that teach the
surface. Selection, caret, focus ring and scrollbar themed from the palette.

### Verification

`npx impeccable detect <url> --viewport 1280x800` and `--viewport 390x844`
against the running dev server, as a check, not as a screenshot opinion.

## Slices

Each is independently reviewable and independently revertible.

| # | Slice | Verifiable by |
| --- | --- | --- |
| 1 | `./task-management` export | typecheck + an import from room-web |
| 2 | Read-only board over the real provider at `/board` | real GitHub issue titles over HTTP |
| 3 | Task detail + log tail + Room link | a task detail route for a live issue |
| 4 | Operate-register shell replacing the Experience one | detector clean at both viewports |
| 5 | One agent registry | grok assignable from both surfaces |
| 6 | Promote a Room draft to a real Task | a task created from a Room, visible in the TUI |
| 7 | Human accept / rework from the board | status moves out of 待你决定 |
| 8 | SSE replacing loader revalidation | composer stays live during a turn |

Slices 1–3 are a read path and carry no write risk. Slice 6 onward writes to a
real backend and must not run unattended.

## Risks

- The bitable is live user data. Any unattended work stays read-only, or targets
  GitHub Issues where a wrong write is visible and revertible.
- Replacing the visual world discards committed design work. `design-qa.md`
  records two iterations against a mock that was chosen for the wrong register;
  it is evidence, not authority.
- Five lanes over ten statuses hides a distinction the loop depends on. The lane
  is the grouping; the card still shows the exact status.
- `apps/web` and `apps/room-web` remain two apps. This RFC adds surface to one of
  them and defers the merge.
