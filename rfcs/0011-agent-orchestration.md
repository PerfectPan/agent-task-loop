# RFC 0011: Agent Orchestration Kernel

## Status

Proposed

## Summary

Add `@rivus/agent-orchestration` as a sibling package in this monorepo. It owns
one occupied **run**: registered templates, seat roster, turn-taking (`allow`),
shared context (goal / facts / mail), and process spawn.

`@rivus/agent-task-loop` is a caller. It must not be imported by the kernel.
`@rivus/agent` (Host) is not a home for this kernel.

## Motivation

ATL's `ReviewLoopService` currently occupies, spawns, and decides the next
business step. Roll-call was prototyped as `claimTask.expectedStatuses` on the
task record — that invades the task backend.

The kernel is the occupancy + roster + context book. Task status stays a
projection the shell writes after it has won `open`.

## Non-goals

- Putting `Team` / `Lead` types in the kernel.
- Moving the package into `PerfectPan/rivus-agent`.
- Extracting `agent-foundation` in this slice.
- Replacing ReviewLoop in the first ATL wiring (loop still directs; it just
  cannot start without winning `open`).
- Provider argv dialects (grok `-p`, `codex exec`) inside the kernel.

## Package

```text
packages/agent-orchestration/    @rivus/agent-orchestration
  contracts/     ports, types, errors (no Node)
  domain/        occupancy rules, templates, run snapshots (no Node)
  application/   Orchestration facade (no fs / execa / homedir)
  infrastructure/  file + memory stores, execa runner, node clock/pid
```

Depends on `execa` only, and only in infrastructure. No `@rivus/agent-task-loop`.
Callers use `createOrchestration()`; tests may use `createMemoryOrchestration()`.

## API (v1)

- `templates.register / get / list`
- `open({ key, template, bind?, context? })` — occupy via exclusive lock file
- `inspect` / `observe` (observe redacts cmd/env)
- `allow(key, seat)`
- `appendFact` / `sendMail`
- `spawn(key, seat, { cwd })` — only if `allowed === seat`
- `heartbeat` / `release` / `listRuns`

Conflict: `OrchestrationConflictError` code `orchestration-conflict`.

Stale lock (dead pid or heartbeat older than `staleAfterMs`) may be taken over.

## ATL wiring (follow-up PR)

`TaskStartService.startTask` calls `open('task:' + taskId)` before the existing
liveness / ReviewLoop path, and `release` in `finally`. Two concurrent starts:
one wins `open`, the other never claims the task backend.

Template `classic-delivery` (`impl`, `review`) is registered by ATL, not by the
kernel.

## Later

- Loop calls `spawn` instead of `execa`.
- Named seats drive the director; ReviewLoop becomes optional.
- Second consumer (Host / presence) → extract `agent-foundation` repo.

## References

- Product direction: `rfcs/0010-agentic-task-team-runtime.md`
- Mechanism vs policy; Contract Net (award before work); blackboard is facts,
  not scheduling; Anthropic 2026 multiagent note (CEO prompt ≠ occupancy).
