# Spec 0002: Discovery Before Assignment

Carries the unimplemented part of the retired RFC 0002 (Code Agent Discovery).
Discovery itself is delivered and documented in
[`docs/architecture/agent-finder.md`](../architecture/agent-finder.md).

## Status

Draft

Paired Plan: [`docs/plans/0002-discovery-before-assignment.md`](../plans/0002-discovery-before-assignment.md)

## Problem And Scope

Today only `agent-task-loop init` consults `@rivus/agent-finder-core`. `start`,
`run`, `resume`, the TUI, and the Rivus `task-start` tool hand a Task to its
`targetAgent` without checking that the agent is runnable on this host. A
missing or broken agent command fails late, after the Task has been claimed.

In scope: checking the target agent's discovery status before a Task is
claimed for execution, and reporting a clear, stable error when it is not
runnable.

Out of scope: choosing a different agent automatically, changing the
discovery catalog or status semantics, and Room members (room-web uses ACP
probes, not discovery).

## Behavioral Requirements

- Before claiming a Task for execution, the loop must confirm that the Task's
  target agent is `runnable` on this host.
- If the target agent is `found`, `missing`, or `unknown`, the loop must not
  claim the Task, must leave the Task Backend record unchanged, and must report
  the agent id, its status, and the discovery evidence summary.
- An agent configured with an explicit command that discovery does not know
  must not be rejected by this check.
- The check must not read config file contents or start agent sessions,
  matching the discovery privacy boundary.

## Domain Invariants

- A Task is never claimed for an agent that discovery reports as not runnable.
- The discovery check never mutates the Task Backend.

## Acceptance Examples

### S1: Runnable agent starts

- Given a pending Task targeting `codex` and discovery reports `codex` as `runnable`
- When the user runs `start` for that Task
- Then the Task is claimed and execution begins as today

### S2: Missing agent is refused before claim

- Given a pending Task targeting `claude` and discovery reports `claude` as `missing`
- When the user runs `start` for that Task
- Then the command exits non-zero with the agent id, status, and evidence
- And the Task's status and claim fields are unchanged

### S3: Unknown custom agent is not blocked

- Given an agent entry whose command has no discovery provider
- When a Task targeting it is started
- Then the check is skipped for that agent and execution begins

## Compatibility And Constraints

- Public API: the Rivus `task-start` tool maps a refusal to a stable business
  error without exposing host paths.
- Persisted data: none.
- Configuration: unconfirmed whether an opt-out flag is needed.
- Operational bounds: discovery runs bounded version probes; how often it runs
  is an open decision in the paired Plan.

## Acceptance Evidence

- Scenario IDs and corresponding tests: not written yet.
- Runtime or package evidence: not available yet.
