# Agent Task Loop — workflow

Agent Task Loop drives a task from assignment to a publish-ready handoff. A task
moves through a fixed set of statuses; coding agents pick up **rounds** of work
(execute / review / rework / publish), each recorded in the task's session
history as its own agent session.

## Task status lifecycle

The store holds one status per task. Statuses (the Chinese labels are the source
of truth in `TASK_STATUSES`) advance like this:

```mermaid
stateDiagram-v2
    state "待处理 queued" as pending
    state "执行中 executing" as exec
    state "待复核 review" as review
    state "修复中 rework" as rework
    state "待决策 decision" as decide
    state "待发布 publish" as publish
    state "待验收 accept" as accept
    state "已完成 done" as done
    state "已失败 failed" as failed

    [*] --> pending: created
    pending --> exec: agent claims & runs
    exec --> review: work done, request review
    exec --> decide: needs a human decision
    exec --> failed: unrecoverable error

    review --> publish: review passed
    review --> rework: review found issues
    review --> decide: escalate to human

    rework --> review: reworked, re-review
    rework --> failed: gave up

    decide --> exec: human says continue
    decide --> failed: human rejects

    publish --> accept: PR / branch published
    accept --> done: accepted
    accept --> rework: changes requested

    done --> [*]
    failed --> [*]

    note right of review
        Review and rework can
        loop for several rounds.
    end note
```

**Buckets** (how the dashboard tabs group them):

| Bucket | Statuses |
| --- | --- |
| Active (running + queued) | 待处理 · 进行中 · 执行中 · 待复核 · 修复中 · 待发布 |
| Needs Input | 待决策 · 待验收 |
| Done | 已完成 · 已失败 |

## Agent rounds (per task)

Each status transition above is driven by an agent **round**. A task accumulates
rounds across its life; every round is its own session (with its own transcript),
appended to `SessionHistory` as `round=N | kind=… | agent=… | id=…`.

```mermaid
flowchart LR
    A([认领 assign]) --> E[round: execute<br/>agent writes the change]
    E --> R{round: review<br/>reviewer agent}
    R -- issues --> F[round: rework<br/>execute again]
    F --> R
    R -- pass --> P[round: publish<br/>publish-commit / publish-mr]
    P --> V{待验收<br/>human acceptance}
    V -- changes --> F
    V -- accept --> D([已完成 done])
```

Observed round kinds in real data: `execute`, `review`, `publish-commit`,
`publish-mr`.

## Where to see it

- **`agent-task-loop tui`** — the interactive dashboard. The session-preview pane
  lists a task's rounds (history mode); press `Enter` on a round to read that
  round's full agent **transcript**.
- **Session history** is stored on each task and parsed back into the timeline
  the dashboard shows.
