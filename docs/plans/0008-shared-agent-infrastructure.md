# Shared Agent Infrastructure with agent-presence

Carries the retired RFC 0008, which was a research proposal. None of its
phases has started.

- Status: draft
- Owner: unconfirmed
- Reviewer: unconfirmed
- Last updated: 2026-10-01
- Paired Spec: none (technical refactor; user-visible behavior of both repositories stays the same)

## Contents

1. Background and goals
2. Outline
3. Detailed design
6. Execution plan
7. Risks, open questions, and follow-up

## 1. Background and goals

### 1.1 Current behavior and constraints

`PerfectPan/agent-presence` (`@rivus/agent-presence`) and this monorepo encode
the same knowledge twice. Evidence was read at agent-presence v0.6.1; line
numbers may have drifted.

| Capability | Here | agent-presence |
| --- | --- | --- |
| Agent catalog and config roots | `agent-finder/agent_discovery_core/catalog/providers.mbt` | Hook installers hardcode `~/.claude/settings.json`, `~/.codex/hooks.json`, `~/.gemini/settings.json`, `~/.config/opencode/opencode.json`, `~/.pi/agent/settings.json` |
| `~` expansion | `agent-finder/src/support/expand-path.ts` | Per-file `homedir()` + `join()` |
| Transcript roots | `agent-sessions/src/session/fs-index.ts` `defaultSessionRoots` (`~/.codex/sessions`, `~/.claude/projects`) | `src/usage/scan-*.ts`: honors `CLAUDE_CONFIG_DIR`, adds Codex `archived_sessions` and `~/.pi/agent/sessions` |
| `.jsonl` walking and line reading | `agent-sessions` `buildFsIndex`, `transcript/parse.ts` | `src/usage/read-jsonl.ts` |
| Transcript parsing | `agent-sessions` reads messages and drops `token_count` | agent-presence reads token usage from the same files |

- `@rivus/agent-finder-core` is published and consumable today.
- `@rivus/agent-sessions` is `private: true` at 0.0.0 and cannot be consumed
  by another repository.
- agent-presence depends on no `@rivus/*` package.

### 1.2 Problem

Every new agent, path convention change, or transcript quirk must be tracked
in both repositories with nothing linking them.

### 1.3 Goals and success criteria

- One source of truth for which agents exist and where their config and
  transcripts live, consumed by both repositories.
- agent-presence deletes its hardcoded path catalog and `.jsonl` walker.
- Each phase ships alone and is reversible.

### 1.4 Non-goals

- Moving usage accounting, pricing, or hook installation into this repository.
- Changing the MoonBit build.
- Merging the repositories.
- Adding agents that neither repository knows.

## 2. Outline

### 2.1 Boundaries and responsibilities

| Capability | Owner |
| --- | --- |
| Agent identity, config roots, settings/hooks and transcript paths | `@rivus/agent-finder-core` |
| `~` expansion, PATH command resolution | `@rivus/agent-finder-core` |
| Transcript roots, `.jsonl` walking, line parsing, usage-bearing entries | `@rivus/agent-sessions` (after publishing) |
| Hook install, pricing, window accounting | agent-presence |

### 2.2 Design decisions

- Extend `ProviderSpec` with optional transcript-root and settings/hooks-file
  fields; existing output is unchanged when they are absent.
- Expose raw or usage-bearing transcript entries from `agent-sessions` instead
  of merging the two parsers.
- Defer a separate `@rivus/agent-fs` package until phases 1–2 show remaining
  duplication.

## 3. Detailed design

### 3.7 Compatibility and migration

All catalog and `agent-sessions` API changes are additive. Publishing
`agent-sessions` flips `private` and assigns a real version; monorepo
consumers are unaffected. agent-presence's CLI behavior is unchanged.

## 6. Execution plan

### 6.1 Preconditions

- The owner confirms agent-presence should consume `@rivus` packages.
- For phases 2–3: a decision to publish `@rivus/agent-sessions` (Phase 0).

### 6.2 Completion contract

- agent-presence has no hardcoded agent config or transcript paths and no
  private `.jsonl` walker.
- Both repositories' test suites pass on each phase.

### 6.3 Execution order

#### Task 0: Publish `@rivus/agent-sessions`

- Files: `packages/agent-sessions/package.json`, a changeset.
- Change: `private: false`, publish config, first version.
- Tests: package smoke import from a clean consumer.
- Exit condition: package on npm.

#### Task 1: Catalog as source of truth (independent of Task 0)

- Files: `packages/agent-finder/agent_discovery_core/model/types.mbt`,
  `catalog/providers.mbt`, the TypeScript contract types, then agent-presence
  installers.
- Change: add transcript-root and settings/hooks-file fields (including Codex
  `hooks.json`); agent-presence reads them.
- Tests: catalog tests for the new fields; agent-presence installer tests.
- Exit condition: agent-presence installer literals removed.

#### Task 2: Shared transcript layer (needs Task 0)

- Files: `packages/agent-sessions/src/**`, agent-presence `src/usage/**`.
- Change: `CLAUDE_CONFIG_DIR`-aware Claude root, Codex `archived_sessions`,
  a Pi provider, a parameterized file filter, a usage-bearing entry API;
  agent-presence keeps only usage extraction and pricing.
- Tests: fixtures for each new root and the usage entry.
- Exit condition: agent-presence `read-jsonl.ts` and per-file roots deleted.

#### Task 3: Optional primitive extraction

Only if duplication remains after Tasks 1–2.

### 6.4 Validation ledger

| Batch | Command or evidence | Expected result |
| --- | --- | --- |
| each | `pnpm test`, `pnpm build`, `pnpm typecheck` here | pass |
| each | agent-presence test suite | pass |

### 6.5 Rollback per batch

Each task is one PR per repository; revert agent-presence first, then this
repository's additive change if needed.

## 7. Risks, open questions, and follow-up

| Item | Type | Impact | Owner | Next step or deadline |
| --- | --- | --- | --- | --- |
| Whether to publish `@rivus/agent-sessions` at all | open question | Gates Tasks 2–3 | unconfirmed | Owner decision |
| Swapping agent-presence's Claude root would lose `CLAUDE_CONFIG_DIR` support | risk | Missed usage | unconfirmed | Task 2 adds it first |
| UUID-name vs mtime-window file selection differ between the two walkers | risk | Wrong file sets | unconfirmed | Parameterize the filter |
| Findings were read from source, not executed | risk | Stale line references | unconfirmed | Re-verify at start |
