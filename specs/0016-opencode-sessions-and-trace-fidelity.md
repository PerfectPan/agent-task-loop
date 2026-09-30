# Spec 0016: OpenCode Sessions and Trace Fidelity

Carries the unfinished phases (SPIKE-OC and P6) of the retired plan for the
session browser (issue #25) and CLI output redesign (issue #23). The delivered
phases P1–P5 are documented in
[`docs/architecture/agent-sessions.md`](../docs/architecture/agent-sessions.md).

## Status

Draft

Paired Plan: [`docs/plans/0016-opencode-sessions-and-trace-fidelity.md`](../docs/plans/0016-opencode-sessions-and-trace-fidelity.md)

## Problem And Scope

The session browser covers Codex and Claude. OpenCode sessions do not appear,
traces are preview-grade, the trace pane cannot be searched, and resume only
prints a command.

In scope: OpenCode sessions in list, inspect, browse, and resume; richer trace
entries (`tool_result` bodies, code blocks); in-trace scroll and search; an
explicit opt-in to execute the resume command.

Out of scope: publishing `@rivus/agent-sessions`, moving session discovery into
the MoonBit core, and token-usage accounting.

## Behavioral Requirements

- `agent-finder sessions list` must include OpenCode sessions when an OpenCode
  session store exists, newest-first alongside Codex and Claude.
- `sessions inspect <id>` must show an OpenCode session's trace.
- OpenCode sessions must report `resumable: true` only when a verified resume
  command exists for their id.
- Trace entries must be able to show tool results and code blocks, not only
  collapsed text.
- The browser must support scrolling a long trace and searching within it.
- Executing a resume command must require an explicit flag; printing stays the
  default.
- A missing or unreadable OpenCode store must not fail listing of other agents.

## Domain Invariants

- Session discovery never throws into its callers; a failing provider
  contributes no sessions.
- Session discovery reads only session stores, never credentials.

## Acceptance Examples

### S1: OpenCode sessions listed

- Given an OpenCode session store with two sessions and a Codex root with one
- When the user runs `agent-finder sessions list --json`
- Then three sessions are returned newest-first with the right `agent`

### S2: Unreadable OpenCode store

- Given an OpenCode store that cannot be opened
- When the user lists sessions
- Then Codex and Claude sessions are listed and the command succeeds

### S3: Tool result visible

- Given a Claude transcript with a tool call and its result
- When the user inspects the session
- Then the tool result body appears under the tool call

### S4: Resume stays print-only by default

- Given a resumable session
- When the user runs `sessions resume <id>` without the execute flag
- Then the command is printed and no process starts

## Compatibility And Constraints

- Public API: `agent-finder-cli` gains flags; existing output stays valid.
- Persisted data: none written.
- Configuration: none.
- Operational bounds: SQLite reads must be read-only and bounded.

## Acceptance Evidence

- Scenario IDs and corresponding tests: not written yet.
- Runtime or package evidence: not available yet.
