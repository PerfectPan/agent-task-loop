# OpenCode Sessions and Trace Fidelity

- Status: blocked
- Owner: unconfirmed
- Reviewer: unconfirmed
- Last updated: 2026-10-18
- Paired Spec: [`docs/specs/0016-opencode-sessions-and-trace-fidelity.md`](../specs/0016-opencode-sessions-and-trace-fidelity.md)

## Contents

1. Background and goals
2. Outline
3. Execution plan
4. Risks, open questions, and follow-up

## 1. Background and goals

### 1.1 Current behavior and constraints

- `@rivus/agent-kit/sessions` lists session files through
  `builtinSessionAdapters` (claude-code, codex, grok). The kit's
  `CodingAgentId` already includes `opencode`, but no adapter produces it.
- OpenCode keeps sessions in SQLite (`~/.local/share/opencode/opencode.db`,
  tables `session` / `message` / `part`, ids `ses_…`), not JSONL. This was
  observed when the original plan was written and has not been re-verified.
- The kit's `SessionHead` has no `resumable` field, and resume is not a kit
  concept; resumability is only visible as `resumeCommandFor(agent, id)`
  returning a command or `null`
  (`packages/agent-finder-cli/src/sessions/resume.ts`).
- The kit's `loadTranscript` keeps `tool_result` events, but the CLI's preview
  turns (`turnOf` in `packages/agent-finder-cli/src/sessions/view.ts`) drop
  them and other non-message payloads.
- The browser (`packages/agent-finder-cli/src/commands/sessions-browse-command.tsx`)
  has no viewport scrolling or search.

### 1.2 Problem

See the paired Spec.

### 1.3 Goals and success criteria

Spec 0016 S1–S5 pass as tests with fixture stores.

### 1.4 Non-goals

As in the Spec.

## 2. Outline

### 2.1 Boundaries and responsibilities

An OpenCode `SessionAdapter` in the kit (`@rivus/agent-kit/sessions`) reads
the SQLite store on a separate code path from the file-based adapters. Resume
commands stay in each application's resume table; the kit stays free of resume
knowledge.

### 2.2 Design decisions

| Decision                                                                              | Status                     |
| ------------------------------------------------------------------------------------- | -------------------------- |
| SQLite reader: `node:sqlite` vs `better-sqlite3` (native dependency in a bundled CLI) | unresolved, needs SPIKE-OC |
| Does `opencode` expose a resume command keyed by `ses_…`                              | unresolved, needs SPIKE-OC |
| Preview rendering of `tool_result` output and code blocks                             | unresolved                 |

## 6. Execution plan

Tasks 1–3 are blocked until SPIKE-OC answers the two questions above. Task 4
does not depend on SPIKE-OC.

#### Task 0: SPIKE-OC (no PR)

- Read a real `opencode.db`: schema, the session-to-message join, and whether a
  resume CLI exists. Record the result here and mark go or no-go.
- Exit condition: section 2.2 rows for the reader and resume are resolved.

#### Task 1: OpenCode provider

- Files: the kit's `/sessions` entry (a new OpenCode `SessionAdapter` in
  `builtinSessionAdapters`), then a `@rivus/agent-kit` bump here.
- Tests: S1, S2 with a fixture database.
- Exit condition: `sessions list --json` shows OpenCode sessions.

#### Task 2: Richer trace entries

- Files: `packages/agent-finder-cli/src/sessions/view.ts` (the kit's
  `TranscriptEvent` already carries `tool_result` output), CLI formatters.
- Tests: S3; `previewLines` output in
  `packages/agent-task-loop/src/tui/data/fs-session-provider.ts` stays
  unchanged.
- Exit condition: tool results render in `sessions inspect`.

#### Task 3: Scroll, search, and opt-in execute

- Files: `sessions-browse-command.tsx`, `sessions-resume-command.ts`.
- Tests: S4; component tests for scroll and search.
- Exit condition: execute flag starts the agent only when given.

#### Task 4: `Session.resumable`

- Files: `src/sessions/resume.ts`, `sessions-list-command.ts`,
  `sessions-inspect-command.ts`, `sessions-browse-command.tsx` and formatters
  in `packages/agent-finder-cli`. Resume is not a kit concept, so the flag is
  not added to the kit's `SessionHead`.
- Change: the CLI sets `resumable` from whether `resumeCommandFor` returns a
  command for the session, prints it in JSON and gates the resume hint in the
  browser on it.
- Tests: S5; existing `resumeCommand` tests stay green.
- Exit condition: `sessions list --json` shows `resumable` for every session.

### 6.4 Validation ledger

| Batch | Command or evidence                         | Expected result |
| ----- | ------------------------------------------- | --------------- |
| each  | `pnpm test`, `pnpm build`, `pnpm typecheck` | pass            |

### 6.5 Rollback per batch

Each task is one PR and reverts alone. `@rivus/agent-finder-cli` changes ship
with a changeset.

## 7. Risks, open questions, and follow-up

| Item                                                   | Type | Impact                                  | Owner       | Next step or deadline                              |
| ------------------------------------------------------ | ---- | --------------------------------------- | ----------- | -------------------------------------------------- |
| A native SQLite dependency complicates the bundled CLI | risk | Install failures                        | unconfirmed | Prefer `node:sqlite` if SPIKE-OC shows it suffices |
| OpenCode's store schema changes between releases       | risk | Broken listing                          | unconfirmed | S2 keeps other agents working                      |
| Agent attribution comes from the source root           | risk | Misattributed sessions if roots overlap | unconfirmed | Keep roots disjoint                                |
