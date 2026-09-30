# Spec 0016: OpenCode Sessions and Trace Fidelity

Carries the unfinished scope of the retired plan for the session browser
(issue #25) and CLI output redesign (issue #23): SPIKE-OC, P6, and the part of
P5 that did not ship. P1–P4 and P5's print-only resume command for Codex and
Claude are delivered and documented in
[`docs/architecture/agent-sessions.md`](../docs/architecture/agent-sessions.md).
P5 also planned a `Session.resumable` capability flag; it does not exist, and
callers can only learn resumability by calling `resumeCommand(id)` and getting
`null`.

## Status

Draft

Paired Plan: [`docs/plans/0016-opencode-sessions-and-trace-fidelity.md`](../docs/plans/0016-opencode-sessions-and-trace-fidelity.md)

## Problem And Scope

The session browser covers Codex and Claude. OpenCode sessions do not appear,
traces are preview-grade, the trace pane cannot be searched, and resume only
prints a command.

In scope: a `Session.resumable` capability flag that list, inspect, and the
browser expose; OpenCode sessions in list, inspect, browse, and resume; richer
trace entries (`tool_result` bodies, code blocks); in-trace scroll and search;
an explicit opt-in to execute the resume command.

Known discovery gaps outside this Spec: the Claude root ignores
`CLAUDE_CONFIG_DIR`, and Codex `archived_sessions` is not scanned.
[Plan 0008](../docs/plans/0008-shared-agent-infrastructure.md) Task 2 owns both.

Out of scope: publishing `@rivus/agent-sessions`, moving session discovery into
the MoonBit core, and token-usage accounting.

## Behavioral Requirements

- `agent-finder sessions list` must include OpenCode sessions when an OpenCode
  session store exists, newest-first alongside Codex and Claude.
- `sessions inspect <id>` must show an OpenCode session's trace.
- Every listed session must carry `resumable`, and it must be `true` exactly
  when `resumeCommand(id)` returns a command. `sessions list --json` and
  `sessions inspect --json` must include it, and the browser must show the
  resume affordance only for resumable sessions.
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

### S5: Resumability is visible

- Given a Codex session and a session whose provider has no resume command
- When the user runs `agent-finder sessions list --json`
- Then the Codex session has `resumable: true` and the other `resumable: false`

## Compatibility And Constraints

- Public API: `agent-finder-cli` gains flags; existing output stays valid.
- Persisted data: none written.
- Configuration: none.
- Operational bounds: SQLite reads must be read-only and bounded.

## Acceptance Evidence

- Scenario IDs and corresponding tests: not written yet.
- Runtime or package evidence: not available yet.
